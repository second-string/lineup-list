import redis from "redis";

import * as spotifyHelper from "./spotify-helper";

export async function getArtistsForFestival(redisClient: redis.RedisClient, festivalName: string, festivalYear: number): Promise<SpotifyArtist[]> {
    const artistIdsPromise: Promise<string> = new Promise((resolve, reject) => {
        redisClient.get(`festival:${festivalName.toLowerCase()}_${festivalYear}`, (err: Error, obj: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(obj);
            }
        });
    });

    const artistIdsString: string = await artistIdsPromise;
    const artistIds = JSON.parse(artistIdsString);

    const redisArtistPromises: Promise<RedisArtist>[] = [];
    for (const artistId of artistIds) {
        const redisArtistPromise: Promise<RedisArtist> = new Promise((resolve, reject) => {
            redisClient.hgetall(`artist:${artistId}`, async (err: Error, obj: any) => {
                if (err) {
                    reject(err);
                } else if (obj === null) {
                    // We did not have artist in our cache, go get it from spotify and save
                    const spotifyArtist: SpotifyArtist = await spotifyHelper.getArtistById(artistId);
                    const redisArtist: any = spotifyToRedisArtist(spotifyArtist);
                    console.log(`adding redis artist ${artistId} to the cache`);
                    redisClient.hmset(`artist:${artistId}`, redisArtist, redis.print);
                    resolve(redisArtist);
                } else {
                    resolve(obj as RedisArtist);
                }
            });
        });

        redisArtistPromises.push(redisArtistPromise);
    }

    const redisArtists: RedisArtist[] = await Promise.all(redisArtistPromises);
    return redisArtists.map(x => redisToSpotifyArtist(x));
}

export async function getTopTracksForArtist(redisClient: redis.RedisClient, artist: SpotifyArtist, tracksPerArtist: number): Promise<SpotifyTrack[]> {
    // Coerce to a number since it'll never evaluate to true when checking if we've reached it if it's a string
    tracksPerArtist = Number(tracksPerArtist);

    // We need two lists because there's a chance that some tracks come from redis and some from spotify
    const topTracksFromRedis: RedisTrack[] = [];
    let topTracksFromSpotify: SpotifyTrack[] = [];

    if (!artist.top_track_ids || artist.top_track_ids.length === 0) {
        // We've never gotten tracks and saved their ids for this artist, need to call spotify for tracks,
        // save their ids for this artist, and save the tracks themselves. We cache all track IDs per artist
        // and tracks themselves, but only return the number requested
        console.log(`No top track ids for spotify artist ${artist.id}, getting from spot, saving to redis artist, and saving each track`);
        const spotifyTracks: SpotifyTrack[] = await spotifyHelper.getAllTracksForArtist(artist);
        redisClient.hmset(`artist:${artist.id}`, { top_track_ids: JSON.stringify(spotifyTracks.map(x => x.id)) }, redis.print);

        for (const spotifyTrack of spotifyTracks) {
            const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
            redisClient.hmset(`track:${redisTrack.id}`, redisTrack, redis.print);
        }

        topTracksFromSpotify = topTracksFromSpotify.concat(spotifyTracks.slice(0, tracksPerArtist));
    } else {
        console.log(`Have top track ids for artist ${artist.id}`);
        for (const trackId of artist.top_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> = new Promise((resolve, reject) => {
                redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(obj as RedisTrack);
                    }
                })
            });

            const track: RedisTrack = await getTrackPromise;

            if (track === null) {
                console.log(`Did not have track ${trackId}, getting from spotify`);
                // It was not in our cache, we need to request it from spotify and cache the response
                // I'm not sure if this is possible? Since it would have to be in our cache if we had
                // the ID saved in the artist's top tracks IDs (unless it's been evicted I guess)
                const spotifyTrack: SpotifyTrack = await spotifyHelper.getTrackById(trackId);
                // console.log(`got ${spotifyTrack.name} spotify track`);
                const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
                // console.log(`adding ${redisTrack.name} redis track to the cache after translating`)
                // console.log(redisTrack);
                redisClient.hmset(`track:${redisTrack.id}`, redisTrack, redis.print);
                topTracksFromSpotify.push(spotifyTrack);
            } else {
                // console.log(`We had track ${trackId} in the cache, all good`);
                // Happy path, we found the track in our cache: push onto returned list
                topTracksFromRedis.push(track);
            }

            if (topTracksFromSpotify.length + topTracksFromRedis.length === tracksPerArtist) {
                break;
            }
        }
    }

    return topTracksFromSpotify.concat(topTracksFromRedis.map(x => redisToSpotifyTrack(x)));
}

function redisToSpotifyTrack(redisTrack: RedisTrack): SpotifyTrack {
    const { artists, spotify_url, available_markets, ...spotifyTrack } = redisTrack;

    return {
        artists: JSON.parse(artists),
        available_markets: available_markets ? JSON.parse(available_markets) : "[]",
        external_urls: { 'spotify': spotify_url },
        external_ids: {},
        ...spotifyTrack
    }
}

function spotifyToRedisTrack(spotifyTrack: SpotifyTrack): RedisTrack {
    const { artists, external_urls, external_ids, preview_url, album, ...restOfRedisTrack } = spotifyTrack;

    // stringify artists, album, & preview_url (which stringifies null since hmset errors on it).
    // map spotify_url from external_urls entry, drop external_ids b/c it's got nested keys and I have no clue wtf it's for.
    const redisTrack: any = {
        artists: JSON.stringify(artists),
        spotify_url: external_urls.spotify,
        album: JSON.stringify(album),
        preview_url: JSON.stringify(preview_url),
        ...restOfRedisTrack
    }

    for (const [key, value] of Object.entries(redisTrack)) {
        if (typeof(value) === "undefined") {
            console.log(`Replaced undefined value with empty string for key ${key} in spotify track ${spotifyTrack.id}`);
            redisTrack[key] = "";
        } else if (value instanceof Array || value instanceof Object) {
            console.log(`Replaced obj/array value with stringified for key ${key} in spotify track ${spotifyTrack.id}`);
            redisTrack[key] = JSON.stringify(value);
        }
    }

    return redisTrack;
}

// Perform the json parsing for the stringified genres and top_tracks fields, rebuild the nested external_urls
// type from the spotfy_url field, and re-add the nested images and followers fields we don't care about
function redisToSpotifyArtist(redisArtist: RedisArtist): SpotifyArtist {
    const { spotify_url, genres, top_track_ids, combined_genres, ...spotifyArtist } = redisArtist;
    const external_urls = {
        "spotify": spotify_url
    };

    return {
        external_urls,
        genres: JSON.parse(genres),
        combined_genres: combined_genres ? JSON.parse(combined_genres) : [],
        top_track_ids: JSON.parse(top_track_ids),
        images: {},
        followers: {},
        ...spotifyArtist
    };
}

function spotifyToRedisArtist(spotifyArtist: SpotifyArtist): RedisArtist {
    const { external_urls, images, followers, genres, top_track_ids, combined_genres, ...restOfArtist } = spotifyArtist;

    // ternary and handle null top_track_ids since it's something we're appending. It might not
    // be on an artist if we haven't put it there yet, and it'll error an hmset if it's undefined
    const redisArtist: any = {
        spotify_url: external_urls.spotify,
        genres: JSON.stringify(genres),
        combined_genres: combined_genres ? JSON.stringify(combined_genres) : "[]",
        top_track_ids: top_track_ids ? JSON.stringify(top_track_ids) : "[]",
        ...restOfArtist
    };

    for (const [key, value] of Object.entries(redisArtist)) {
        if (typeof(value) === "undefined") {
            console.log(`Replaced undefined value with empty string for key ${key} in spotify artist ${redisArtist.id}`);
            redisArtist[key] = "";
        } else if (value instanceof Array || value instanceof Object) {
            console.log(`Replaced obj/array value with stringified for key ${key} in spotify artist ${spotifyArtist.id}`);
            redisArtist[key] = JSON.stringify(value);
        }
    }

    return redisArtist;
}
