import redis from "redis";

import * as spotifyHelper from "./spotify-helper";

export async function getArtistsForFestival(redisClient: redis.RedisClient, festivalName: string, festivalYear: number):
    Promise<SpotifyArtist[]> {
    // Get the days we support for this festival. Single day of 0 if no day lineup info yet
    const daysPromise: Promise<string[]> = new Promise((resolve, reject) => {
        redisClient.get(`festival:${festivalName.toLowerCase()}_${festivalYear}:days`, (err: Error, obj: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(obj));
            }
        });
    });

    const days: string[] = await daysPromise;

    const redisArtistPromises: Promise<any>[] = [];
    for (const day of days) {
        if (day === undefined || day === "") {
            console.warn(`Got day ${day ? day : "undefined"} from ${festivalName} redis days list, skipping`);
            continue;
        }

        // Get the artist IDs for this specific day
        const artistIdsPromise: Promise<string> = new Promise((resolve, reject) => {
            redisClient.get(`festival:${festivalName.toLowerCase()}_${festivalYear}:${day}`,
                            (err: Error, obj: string) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(obj);
                                }
                            });
        });

        const artistIdsString: string = await artistIdsPromise;
        const artistIds               = JSON.parse(artistIdsString);

        // For every artist ID on thsi day, check our cache for their object. If we don't have them, get from spotify
        // and convert, then store
        for (const artistId of artistIds) {
            const redisArtistPromise = new Promise((resolve, reject) => {
                redisClient.hgetall(`artist:${artistId}`, async (err: Error, obj: any) => {
                    if (err) {
                        reject(err);
                    } else if (obj === null) {
                        // We did not have artist in our cache, go get it from spotify and save
                        const spotifyArtist: SpotifyArtist = await spotifyHelper.getArtistById(artistId);
                        const redisArtist: any             = spotifyToRedisArtist(spotifyArtist);
                        console.log(`adding redis artist ${artistId} to the cache`);
                        redisClient.hmset(`artist:${artistId}`, redisArtist, (redisErr, res) => {
                            if (redisErr) {
                                console.error(err);
                            }
                        });

                        // Tag each artist with the day for this festival so we can group when resolving all promises
                        redisArtist.day = day;
                        resolve(redisArtist);
                    } else {
                        // Tag each artist with the day for this festival so we can group when resolving all promises
                        obj.day = day;
                        resolve(obj);
                    }
                });
            });

            redisArtistPromises.push(redisArtistPromise);
        }
    }

    // Technically a RedisArtist[] but with the extra day field we have to cast as any[]
    const redisArtists: any[] = await Promise.all(redisArtistPromises);
    return redisArtists.map(x => {
        const spotifyArtist = redisToSpotifyArtist(x)
        spotifyArtist.day   = x.day;
        return spotifyArtist;
    });
}

export async function getTopTracksForArtist(redisClient: redis.RedisClient,
                                            artist: SpotifyArtist,
                                            tracksPerArtist: number): Promise<SpotifyTrack[]> {
    // Coerce to a number since it'll never evaluate to true when checking if we've reached it if it's a string
    tracksPerArtist = Number(tracksPerArtist);

    // We need two lists because there's a chance that some tracks come from redis and some from spotify
    const topTracksFromRedis: RedisTrack[]   = [];
    let topTracksFromSpotify: SpotifyTrack[] = [];

    if (!artist.top_track_ids || artist.top_track_ids.length === 0) {
        // We've never gotten tracks and saved their ids for this artist, need to call spotify for tracks,
        // save their ids for this artist, and save the tracks themselves. We cache all track IDs per artist
        // and tracks themselves, but only return the number requested
        console.log(`No top track ids for spotify artist ${
            artist.id}, getting from spot, saving to redis artist, and saving each track`);
        const spotifyTracks: SpotifyTrack[] = await spotifyHelper.getAllTracksForArtist(artist);

        // Get and save track IDs for this artist
        redisClient.hmset(`artist:${artist.id}`,
                          {top_track_ids : JSON.stringify(spotifyTracks.map(x => x.id))},
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        for (const spotifyTrack of spotifyTracks) {
            const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
            redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
        }

        topTracksFromSpotify = topTracksFromSpotify.concat(spotifyTracks.slice(0, tracksPerArtist));
    } else {
        console.log(`Have top track ids for artist ${artist.id}`);
        for (const trackId of artist.top_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> =
                new Promise((resolve, reject) => {redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(obj as RedisTrack);
                                }
                            })});

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
                redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                    if (err) {
                        console.error(err);
                    }
                });
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

export async function getNewestTracksForArtist(redisClient: redis.RedisClient,
                                               artist: SpotifyArtist,
                                               tracksPerArtist: number): Promise<SpotifyTrack[]> {
    // Coerce to a number since it'll never evaluate to true when checking if we've reached it if it's a string
    tracksPerArtist = Number(tracksPerArtist);

    // We need two lists because there's a chance that some tracks come from redis and some from spotify
    const newestTracksFromRedis: RedisTrack[]   = [];
    let newestTracksFromSpotify: SpotifyTrack[] = [];

    if (!artist.newest_track_ids || artist.newest_track_ids.length === 0) {
        // We've never gotten albums and saved their ids for this artist, need to call spotify for albums,
        // save their ids for this artist, save the albums themselves, and (EXTRA STEP COMPARED TO TOP TRACKS) get the
        // tracks from the most recent album(s). We cache up to 50 album IDs per artist (max recieved in spotify query)
        // and albums themselves, but only return the number requested
        console.log(`No newest track ids for spotify artist ${
            artist.id}, getting albums from spot, saving to redis albums, then getting tracks from most recent album and saving each track`);
        // Technically we could optimize a bit here by checking to see if we already have the albums and skip a query.
        // We also don't handle the case of if the artist releases a new album after we've already newest tracks from
        // the previously-latest album.
        const spotifyAlbums: SpotifyAlbum[] = await spotifyHelper.getAllAlbumsForArtist(artist);
        if (spotifyAlbums.length === 0) {
            console.warn(`Albums returned from getAllAlbumsForArtist length zero. Artist ${artist.name} (${
                artist.id}). Bailing out of remainder of newest tracks process`);
            return [];
        }

        // Get and save album IDs for this artist. Albums are used to look up most recent tracks vs. top tracks
        redisClient.hmset(`artist:${artist.id}`,
                          {album_ids : JSON.stringify(spotifyAlbums.map(x => x.id))},
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        let newestAlbum;
        let newestAlbumDate;
        for (const spotifyAlbum of spotifyAlbums) {
            // Save full album to cache and find most recent
            const redisAlbum: any = spotifyToRedisAlbum(spotifyAlbum);
            redisClient.hmset(`album:${redisAlbum.id}`, redisAlbum, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });

            // Skip any "non-real" albums - this isn't the most robust, we're probably dropping a decent amount here.
            // Good enough for now
            if (redisAlbum.album_group === "compilation" || redisAlbum.album_group === "appears_on" ||
                redisAlbum.album_type === "compilation") {
                continue;
            }

            const currentAlbumDate = Date.parse(spotifyAlbum.release_date);
            if ((newestAlbumDate === undefined) || (currentAlbumDate > newestAlbumDate)) {
                newestAlbum     = spotifyAlbum;
                newestAlbumDate = currentAlbumDate;
            }
        }

        // If the artist only had compilation or group albums, we won't have anything to work with. Bail here too
        if (newestAlbum === undefined) {
            console.warn(`Albums returned from getAllAlbumsForArtist all either compilations or 'appears_on'. Artist ${
                artist.name} (${artist.id}). Bailing out of remainder of newest tracks process`);
            return [];
        }

        // Now get the tracks for the most recent album
        // TODO :: Need to handle case of single album not having enough tracks - if newestTracks.length <
        // tracksPerArtist then get more from subsequent newer albums
        const newestTracks: SpotifyTrack[] = await spotifyHelper.getAllTracksForAlbum(newestAlbum);
        redisClient.hmset(`artist:${artist.id}`,
                          {newest_track_ids : JSON.stringify(newestTracks.map(x => x.id))},
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        for (const spotifyTrack of newestTracks) {
            const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
            redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
        }

        newestTracksFromSpotify = newestTracksFromSpotify.concat(newestTracks.slice(0, tracksPerArtist));
    } else {
        console.log(`Have newest track ids for artist ${artist.id}`);
        // TODO :: Need to handle case of newest track ids not having enough tracks - if newest_track_ids.length <
        // tracksPerArtist then get more from saved albums
        for (const trackId of artist.newest_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> = new Promise((resolve, reject) => {
                redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(obj as RedisTrack);
                    }
                });
            });

            const track: RedisTrack = await getTrackPromise;

            if (track === null) {
                console.log(`Did not have track ${trackId}, getting from spotify`);
                // It was not in our cache, we need to request it from spotify and cache the response
                // I'm not sure if this is possible? Since it would have to be in our cache if we had
                // the ID saved in the artist's top tracks IDs (unless it's been evicted I guess)
                const spotifyTrack: SpotifyTrack = await spotifyHelper.getTrackById(trackId);
                const redisTrack: any            = spotifyToRedisTrack(spotifyTrack);
                redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                newestTracksFromSpotify.push(spotifyTrack);
            } else {
                // Happy path, we found the track in our cache: push onto returned list
                newestTracksFromRedis.push(track);
            }

            if (newestTracksFromSpotify.length + newestTracksFromRedis.length === tracksPerArtist) {
                break;
            }
        }
    }

    return newestTracksFromSpotify.concat(newestTracksFromRedis.map(x => redisToSpotifyTrack(x)));
}

function redisToSpotifyTrack(redisTrack: RedisTrack): SpotifyTrack {
    const {artists, spotify_url, available_markets, ...spotifyTrack} = redisTrack;

    return {
        artists: JSON.parse(artists), available_markets: available_markets ? JSON.parse(available_markets) : "[]",
            external_urls: {'spotify': spotify_url}, external_ids: {}, ...spotifyTrack
    }
}

function spotifyToRedisTrack(spotifyTrack: SpotifyTrack): RedisTrack {
    const {artists, external_urls, external_ids, preview_url, album, ...restOfRedisTrack} = spotifyTrack;

    // stringify artists, album, & preview_url (which stringifies null since hmset errors on it).
    // map spotify_url from external_urls entry, drop external_ids b/c it's got nested keys and I have no clue wtf
    // it's for.
    const redisTrack: any = {
        artists : JSON.stringify(artists),
        spotify_url : external_urls.spotify,
        album : JSON.stringify(album),
        preview_url : JSON.stringify(preview_url),
        ...restOfRedisTrack
    }

    for (const [key, value] of Object.entries(redisTrack)) {
        if (typeof (value) === "undefined") {
            redisTrack[key] = "";
            console.log(
                `Replaced undefined value with empty string for key ${key} in spotify track ${spotifyTrack.id}`);
        } else if (value instanceof Array || value instanceof Object) {
            redisTrack[key] = JSON.stringify(value);

            // This is hecka hacky - ideally I'd check to see if key is in the list of keys of the RedisTrack interface
            // to log or not, since we don't care about notifying outselves about any fields that we haven't declared.
            // Can't get interface keys in nice string list though, so here we are
            if (key !== "linked_from" && key !== "restrictions") {
                console.log(
                    `Replaced obj/array value with stringified for key ${key} in spotify track ${spotifyTrack.id}`);
            }
        }
    }

    return redisTrack;
}

// Perform the json parsing for the stringified genres, album_ids, and top_tracks/newest_tracks fields, rebuild the
// nested external_urls type from the spotfy_url field, and re-add the nested images and followers fields we don't
// care about
function redisToSpotifyArtist(redisArtist: RedisArtist): SpotifyArtist {
    const {spotify_url, genres, top_track_ids, album_ids, newest_track_ids, combined_genres, ...spotifyArtist} =
        redisArtist;
    const external_urls = {"spotify" : spotify_url};

    return {
        external_urls,
        genres : JSON.parse(genres),
        combined_genres : combined_genres ? JSON.parse(combined_genres) : [],
        top_track_ids : top_track_ids ? JSON.parse(top_track_ids) : [],
        album_ids : album_ids ? JSON.parse(album_ids) : [],
        newest_track_ids : newest_track_ids ? JSON.parse(newest_track_ids) : [],
        images : {},
        followers : {},
        ...spotifyArtist
    };
}

function spotifyToRedisArtist(spotifyArtist: SpotifyArtist): RedisArtist {
    const {
        external_urls,
        images,
        followers,
        genres,
        top_track_ids,
        newest_track_ids,
        combined_genres,
        album_ids,
        ...restOfArtist
    } = spotifyArtist;

    // ternary and handle null top_track_ids/newest_track_ids and album_ids since they're something we're appending.
    // They might not be on an artist if we haven't put it there yet, and it'll error an hmset if it's undefined
    const redisArtist: any = {
        spotify_url : external_urls.spotify,
        genres : JSON.stringify(genres),
        combined_genres : combined_genres ? JSON.stringify(combined_genres) : "[]",
        top_track_ids : top_track_ids ? JSON.stringify(top_track_ids) : "[]",
        newest_track_ids : newest_track_ids ? JSON.stringify(newest_track_ids) : "[]",
        album_ids : album_ids ? JSON.stringify(album_ids) : "[]",
        ...restOfArtist
    };

    for (const [key, value] of Object.entries(redisArtist)) {
        if (typeof (value) === "undefined") {
            console.log(
                `Replaced undefined value with empty string for key ${key} in spotify artist ${redisArtist.id}`);
            redisArtist[key] = "";
        } else if (value instanceof Array || value instanceof Object) {
            console.log(
                `Replaced obj/array value with stringified for key ${key} in spotify artist ${spotifyArtist.id}`);
            redisArtist[key] = JSON.stringify(value);
        }
    }

    return redisArtist;
}

/* function redisToSpotifyAlbum(redisAlbum: RedisAlbum): SpotifyAlbum { */
/* } */

function spotifyToRedisAlbum(spotifyAlbum: SpotifyAlbum): RedisAlbum {
    const {artists, external_urls, images, ...restOfAlbum} = spotifyAlbum;

    const redisAlbum: any = {
        spotify_url : external_urls.spotify,
        artists : JSON.stringify(artists),
        ...restOfAlbum,
    };

    for (const [key, value] of Object.entries(redisAlbum)) {
        if (typeof (value) === "undefined") {
            console.log(`Replaced undefined value with empty string for key ${key} in spotify artist ${redisAlbum.id}`);
            redisAlbum[key] = "";
        } else if (value instanceof Array || value instanceof Object) {
            console.log(`Replaced obj/array value with stringified for key ${key} in spotify artist ${redisAlbum.id}`);
            redisAlbum[key] = JSON.stringify(value);
        }
    }

    return redisAlbum;
}

export async function getSessionData(redisClient: redis.RedisClient, sessionUid: string): Promise<SessionData> {
    const sessionDataPromise: Promise<SessionData> =
        new Promise((resolve, reject) => {redisClient.hgetall(`sessionData:${sessionUid}`, (err: Error, obj: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            // The ts type makes the compiler think these are numbers but they're strings when they come
                            // out of the cache
                            const data: SessionData = obj as SessionData;
                            // Only attempt to fill values if we actually have data (won't until they navigate to their
                            // first customize page)
                            if (data !== null) {
                                data.festivalYear    = parseInt(obj.festivalYear, 10);
                                data.tracksPerArtist = parseInt(obj.tracksPerArtist, 10);
                            }
                            resolve(data);
                        }
                    })});

    const playlistData: SessionData = await sessionDataPromise;
    return playlistData;
}
