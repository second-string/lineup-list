import redis from "redis";

import * as constants       from "./constants";
import * as mbHelper        from "./mb-helper";
import * as setlistFmHelper from "./setlist-fm-helper";
import * as spotifyHelper   from "./spotify-helper";

export async function getLineupLastUpdatedDate(redisClient: redis.RedisClient,
                                               festivalName: string,
                                               festivalYear: number): Promise<Date> {
    const datePromise: Promise<string> = new Promise((resolve, reject) => {
        redisClient.get(`festival:${festivalName.toLowerCase()}_${festivalYear}:last_updated_date`,
                        (err: Error, obj: string) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(JSON.parse(obj));
                            }
                        });
    });

    const last_updated_date: string = await datePromise;

    if (last_updated_date) {
        return new Date(last_updated_date);
    }
}

export async function getArtistTopTracksLastUpdated(redisClient: redis.RedisClient, artistId: string): Promise<Date> {
    const datePromise: Promise<string> = new Promise((resolve, reject) => {
        redisClient.hget(`artist:${artistId}`, 'top_track_ids_last_updated', (err: Error, obj: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(obj));
            }
        });
    });

    const last_updated_date: string = await datePromise;

    if (last_updated_date) {
        return new Date(last_updated_date);
    }
}

export async function getArtistNewestTracksLastUpdated(redisClient: redis.RedisClient,
                                                       artistId: string): Promise<Date> {
    const datePromise: Promise<string> = new Promise((resolve, reject) => {
        redisClient.hget(`artist:${artistId}`, 'newest_track_ids_last_updated', (err: Error, obj: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(obj));
            }
        });
    });

    const last_updated_date: string = await datePromise;

    if (last_updated_date) {
        return new Date(last_updated_date);
    }
}

export async function getArtistSetlistTracksLastUpdated(redisClient: redis.RedisClient,
                                                        artistId: string): Promise<Date> {
    const datePromise: Promise<string> = new Promise((resolve, reject) => {
        redisClient.hget(`artist:${artistId}`, 'setlist_track_ids_last_updated', (err: Error, obj: string) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(obj));
            }
        });
    });

    const last_updated_date: string = await datePromise;

    if (last_updated_date) {
        return new Date(last_updated_date);
    }
}

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

    if (!days) {
        console.error(`Tried to view a festival ${festivalName} ${festivalYear} with no days`);
        return [];
    }

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

        const artistIdsString: string                   = await artistIdsPromise;
        const                                 artistIds = JSON.parse(artistIdsString);

        // For every artist ID on this day, check our cache for their object. If we don't have them, get from spotify
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
                        redisClient.hmset(`artist:${artistId}`, redisArtist, (redisErr: Error, res) => {
                            if (redisErr) {
                                console.error(`redis error: ${redisErr}`);
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
    const topTracksFromRedis: RedisTrack[]     = [];
    let   topTracksFromSpotify: SpotifyTrack[] = [];

    const lastUpdated = await getArtistTopTracksLastUpdated(redisClient, artist.id);

    if (!lastUpdated) {
        console.log(`No last updated date for top tracks for artist ${artist.id} found`);
    }

    const refreshThresholdMs = new Date(Date.now() - constants.daysInMsBeforeArtistTracksRefresh);

    if (!artist.top_track_ids || artist.top_track_ids.length === 0 || !lastUpdated ||
        lastUpdated < refreshThresholdMs) {
        // We've never gotten tracks and saved their ids for this artist, or haven't done it for a while, so need to
        // call spotify for tracks, save their ids for this artist, and save the tracks themselves. We cache all track
        // IDs per artist and tracks themselves, but only return the number requested
        console.log(`No/out of date top track ids for spotify artist ${
            artist.id}, getting from spot, saving to redis artist, and saving each track. lastUpdated: ${
            lastUpdated ? lastUpdated.toISOString() : 'never'}`);
        const spotifyTracks: SpotifyTrack[] = await spotifyHelper.getAllTracksForArtist(artist);

        const nowISOString = new Date().toISOString();

        // Get and save track IDs for this artist
        redisClient.hmset(`artist:${artist.id}`,
                          {
                              top_track_ids : JSON.stringify(spotifyTracks.map(x => x.id)),
                              top_track_ids_last_updated : JSON.stringify(nowISOString)
                          },
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
        console.log(`Have top track ids for artist ${artist.name} (${artist.id})`);
        for (const trackId of artist.top_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> =
                new Promise((resolve, reject) => {redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                                if (err) {
                                    console.error(err);
                                    resolve(null);
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
                const spotifyTrack: SpotifyTrack                         = await spotifyHelper.getTrackById(trackId);
                const                                    redisTrack: any = spotifyToRedisTrack(spotifyTrack);
                redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                    if (err) {
                        console.error(err);
                    }
                });
                topTracksFromSpotify.push(spotifyTrack);
            } else {
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
    const newestTracksFromRedis: RedisTrack[]     = [];
    let   newestTracksFromSpotify: SpotifyTrack[] = [];

    const lastUpdated = await getArtistNewestTracksLastUpdated(redisClient, artist.id);

    if (!lastUpdated) {
        console.log(`No last updated date for newest tracks for artist ${artist.id} found`);
    }

    const refreshThresholdMs = new Date(Date.now() - constants.daysInMsBeforeArtistTracksRefresh);

    // Note! Only check for null new tracks here - if it's an empty list (![] evals to false) that means we've
    // previously looked for them and haven't found them, so no need to search again. This happens when all the albums
    // returned for an artist are 'compilation' or 'appears_on', which we don't save tracks for due to remixes,
    // features, etc.
    if (!artist.newest_track_ids || !lastUpdated || lastUpdated < refreshThresholdMs) {
        // We've never gotten albums and saved their ids for this artist, or haven't done it for a while, need to call
        // spotify for albums, save their ids for this artist, save the albums themselves, and (EXTRA STEP COMPARED TO
        // TOP TRACKS) get the tracks from the most recent album(s). We cache up to 50 album IDs per artist (max
        // recieved in spotify query) and albums themselves, but only return the number requested
        console.log(`No/out of date newest track ids for spotify artist ${artist.id}, getting albums from spot, saving to redis albums, then getting tracks from most recent album and saving each track. lastUpdated: ${lastUpdated ? lastUpdated.toISOString() : 'never'}`);

        // Technically we could optimize a bit here by checking to see if we already have the albums and skip a query.
        const spotifyAlbums: SpotifyAlbum[] = await spotifyHelper.getAllAlbumsForArtist(artist);

        let validSpotifyAlbums: SpotifyAlbum[] = [];
        for (const spotifyAlbum of spotifyAlbums) {
            // Skip any "non-real" albums - this isn't the most robust, we're probably dropping a decent amount here.
            // Good enough for now
            if (spotifyAlbum.album_group === "compilation" || spotifyAlbum.album_group === "appears_on" ||
                spotifyAlbum.album_type === "compilation") {
                continue;
            }

            validSpotifyAlbums.push(spotifyAlbum);

            // Save full album to cache
            const redisAlbum: any = spotifyToRedisAlbum(spotifyAlbum);
            redisClient.hmset(`album:${redisAlbum.id}`, redisAlbum, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
        }

        // Get and save album IDs for this artist only after we've filtered out non-valid albums. Albums are used to
        // look up most recent tracks vs. top tracks
        redisClient.hmset(`artist:${artist.id}`,
                          {album_ids : JSON.stringify(validSpotifyAlbums.map(x => x.id))},
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        // If the artist only had compilation or group albums, we won't have anything to work with. Bail here too
        if (validSpotifyAlbums.length === 0) {
            console.warn(
                `Zero albums returned from getAllAlbumsForArtist after filterout out 'compilations' or 'appears_on'. Artist ${
                    artist.name} (${
                    artist.id}). Saved empty list to redis to prevent pointless searches in the future`);
            return [];
        }

        // Order albums by release date descending. Can't just take the newest album from above loop because it might
        // not have a full 10 tracks
        validSpotifyAlbums = validSpotifyAlbums.sort((x, y) => Date.parse(y.release_date) - Date.parse(x.release_date));

        // Now get the tracks starting at most recent album and moving older, deduping as we go, until we get enough
        // const newestTracks: SpotifyTrack[] = await spotifyHelper.getAllTracksForAlbum(newestAlbum);
        const newestTracks: Map<string, SpotifyTrack> = new Map();
        let   albumIndex                              = 0;
        while (newestTracks.size < 15 && albumIndex < validSpotifyAlbums.length) {
            const album       = validSpotifyAlbums[albumIndex];
            const albumTracks = await spotifyHelper.getAllTracksForAlbum(album);
            // For every track of this album, only add the ones we haven't seen yet. Shouldn't be normal to get
            // duplicates, may be impossible.
            for (const track of albumTracks) {
                if (!newestTracks.has(track.id)) {
                    newestTracks.set(track.id, track);
                }
            }

            albumIndex++;
        }

        // Pull out our info into arrays here versus the continuous calling of Array.from every time they're used
        const newestTrackKeys: string[]         = Array.from(newestTracks.keys());
        const newestTrackValues: SpotifyTrack[] = Array.from(newestTracks.values());

        const nowISOString = new Date().toISOString();

        redisClient.hmset(`artist:${artist.id}`,
                          {
                              newest_track_ids : JSON.stringify(newestTrackKeys),
                              newest_track_ids_last_updated : JSON.stringify(nowISOString)
                          },
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        // Get and insert the actual track objects for all newest_track_ids we've saved on the artist
        for (const spotifyTrack of newestTrackValues) {
            const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
            redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
        }

        newestTracksFromSpotify = newestTracksFromSpotify.concat(newestTrackValues.slice(0, tracksPerArtist));
    } else {
        console.log(`Have newest track ids for artist ${artist.id}`);
        for (const trackId of artist.newest_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> = new Promise((resolve, reject) => {
                redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                    if (err) {
                        console.error(err);
                        resolve(null);
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
                const spotifyTrack: SpotifyTrack                         = await spotifyHelper.getTrackById(trackId);
                const                                    redisTrack: any = spotifyToRedisTrack(spotifyTrack);
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

export async function getSetlistTracksForArtist(redisClient: redis.RedisClient,
                                                artist: SpotifyArtist,
                                                tracksPerArtist: number): Promise<SpotifyTrack[]> {
    // Coerce to a number since it'll never evaluate to true when checking if we've reached it if it's a string
    tracksPerArtist = Number(tracksPerArtist);

    // We need two lists because there's a chance that some tracks come from redis and some from spotify
    const setlistTracksFromRedis: RedisTrack[]     = [];
    let   setlistTracksFromSpotify: SpotifyTrack[] = [];

    const lastUpdated = await getArtistSetlistTracksLastUpdated(redisClient, artist.id);

    if (!lastUpdated) {
        console.log(`No last updated date for setlist tracks for artist ${artist.id} found`);
    }

    const refreshThresholdMs = new Date(Date.now() - constants.daysInMsBeforeArtistTracksRefresh);

    // Note! Only check for null setlist tracks here - if it's an empty list that means we've previously looked for them
    // and haven't found them, so no need to search again
    if (!artist.setlist_track_ids || !lastUpdated || lastUpdated < refreshThresholdMs) {
        // We don't have setlist tracks, or they're out of date. Convert the artist to an mbid, get the most recent
        // setlists, get the first 10 track names spread across however many setlists it takes, search each of those
        // track names on spotify, then save the first result for each track
        console.log(`Looking for setlist tracks for the first time, or refresh is due. lastUpdated: ${
            lastUpdated ? lastUpdated.toISOString() : 'never'}`);

        // This will return null if it fails to find an mbid for an artist. That's okay, the getTracksFromSetlists
        // function will short circuit if mbid passed is null. This lets us still save an empty list of setlist tracks
        // in redis for this artist to prevent us from trying to get setlist tracks every time a playlist is created
        // with tracks from recent setlists.
        const artistMbid = await mbHelper.spotifyToMbArtistId(artist.id);

        // Gets 15 (ish, maybe more) setlist tracks for the artist from past setlist. No de-duping. Need to slice to
        // tracksPerArist before showing to user, and 15 drops rapidly once searched and filtered for nulls and dupes
        const setlistTracks: SetlistFmSong[] = await setlistFmHelper.getTracksFromSetlists(artistMbid);

        // clang-format off
        const spotifyTrackPromises: Promise<SpotifyTrack>[] = setlistTracks
            .map(x => new Promise<SpotifyTrack>(async (resolve, reject) => {
                const spotifyTrack: SpotifyTrack = await spotifyHelper.getSpotifyTrack(x.name, artist.name);
                resolve(spotifyTrack);
            }));
        // clang-format on

        let spotifyTracks: SpotifyTrack[] = await Promise.all(spotifyTrackPromises);

        // Remove any songs not found and de-dupe. Inefficient double-iter but easier logic b/c we know both track and y
        // will always have an id in second filter
        // clang-format off
        spotifyTracks = spotifyTracks
            .filter(x => x !== null)
            .filter((track, idx, arr) => arr.findIndex(y => y.id === track.id) === idx);
        // clang-format on

        const nowISOString = new Date().toISOString();

        // Save setlist tracks on artist in redis for next page load
        // TODO :: Should we save setlists here somehow, just like albums for newest tracks?
        redisClient.hmset(`artist:${artist.id}`,
                          {
                              setlist_track_ids : JSON.stringify(spotifyTracks.map(x => x.id)),
                              setlist_track_ids_last_updated : JSON.stringify(nowISOString)
                          },
                          (err, res) => {
                              if (err) {
                                  console.error(err);
                              }
                          });

        // Also save spotify tracks to redis
        for (const spotifyTrack of spotifyTracks) {
            const redisTrack: any = spotifyToRedisTrack(spotifyTrack);
            redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
        }

        setlistTracksFromSpotify = setlistTracksFromSpotify.concat(spotifyTracks.slice(0, tracksPerArtist));
        let logStr = `Received ${spotifyTracks.length} tracks from setlists for ${artist.name} (${artist.id})`;
        if (spotifyTracks.length < tracksPerArtist) {
            // If after the setlist tracks were searched, null filtered, and deduped, we don't have enough to cover
            // tracksperartist, go get top tracks to supplement remainder. This case is most common for artists that
            // have no setlist tracks on setlist.fm
            const topTracks = await getTopTracksForArtist(redisClient, artist, tracksPerArtist - spotifyTracks.length);
            setlistTracksFromSpotify = setlistTracksFromSpotify.concat(topTracks);
            logStr += `, supplemented with ${topTracks.length} top tracks`;
        }

        console.log(logStr);
    } else {
        console.log(`Have setlist track ids for artist ${artist.name} (${artist.id})`);
        // TODO :: Need to handle case of setlist track ids not having enough tracks - if setlist_track_ids.length <
        // tracksPerArtist then get more from setlists
        for (const trackId of artist.setlist_track_ids) {
            // See if we have track in our cache
            const getTrackPromise: Promise<RedisTrack> = new Promise((resolve, reject) => {
                redisClient.hgetall(`track:${trackId}`, (err: Error, obj: any) => {
                    if (err) {
                        console.error(err);
                        resolve(null);
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
                const spotifyTrack: SpotifyTrack                         = await spotifyHelper.getTrackById(trackId);
                const                                    redisTrack: any = spotifyToRedisTrack(spotifyTrack);
                redisClient.hmset(`track:${redisTrack.id}`, redisTrack, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                setlistTracksFromSpotify.push(spotifyTrack);
            } else {
                // Happy path, we found the track in our cache: push onto returned list
                setlistTracksFromRedis.push(track);
            }

            if (setlistTracksFromSpotify.length + setlistTracksFromRedis.length === tracksPerArtist) {
                // Stop if we already have enough
                break;
            }
        }

        // Supplement with top tracks if we don't have enough setlist tracks saved
        if (artist.setlist_track_ids.length < tracksPerArtist) {
            const     topTracks =
                await getTopTracksForArtist(redisClient, artist, tracksPerArtist - artist.setlist_track_ids.length);
            setlistTracksFromSpotify = setlistTracksFromSpotify.concat(topTracks);
        }
    }

    return setlistTracksFromSpotify.concat(setlistTracksFromRedis.map(x => redisToSpotifyTrack(x)));
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
            if (key !== "linked_from" && key !== "restrictions" && key !== "available_markets") {
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
export function redisToSpotifyArtist(redisArtist: RedisArtist): SpotifyArtist {
    const {
        spotify_url,
        genres,
        top_track_ids,
        album_ids,
        newest_track_ids,
        setlist_track_ids,
        combined_genres,
        ...spotifyArtist
    }                   = redisArtist;
    const external_urls = {"spotify" : spotify_url};

    let converted_setlist_track_ids: string[] = null;
    if (!(setlist_track_ids === "null" || setlist_track_ids === null || setlist_track_ids === undefined)) {
        converted_setlist_track_ids = JSON.parse(setlist_track_ids);
    }

    // Parse these out separately for easier undefined diagnosis if problems arise
    const converted_newest_track_ids = newest_track_ids ? JSON.parse(newest_track_ids) : [];
    const converted_top_track_ids    = top_track_ids ? JSON.parse(top_track_ids) : [];
    const converted_genres           = genres ? JSON.parse(genres) : [];
    const converted_combined_genres  = combined_genres ? JSON.parse(combined_genres) : [];
    const converted_album_ids        = album_ids ? JSON.parse(album_ids) : [];

    // Note setlist_track_ids special casing: we need null vs. empty list tristate logic to differentiate
    // never-before-searched setlists for artist compared to found no setlists for artist in previous search.
    return {
        external_urls,
        genres : converted_genres,
        combined_genres : converted_combined_genres,
        top_track_ids : converted_top_track_ids,
        album_ids : converted_album_ids,
        newest_track_ids : converted_newest_track_ids,
        setlist_track_ids : converted_setlist_track_ids,
        images : {},
        followers : {},
        ...spotifyArtist
    };
}

export function spotifyToRedisArtist(spotifyArtist: SpotifyArtist): RedisArtist {
    const {
        external_urls,
        images,
        followers,
        genres,
        top_track_ids,
        newest_track_ids,
        setlist_track_ids,
        combined_genres,
        album_ids,
        ...restOfArtist
    } = spotifyArtist;

    // ternary and handle null top_track_ids/newest_track_ids/setlist_track_ids and album_ids since they're something
    // we're appending. They might not be on an artist if we haven't put it there yet, and it'll error an hmset if it's
    // undefined
    // Note special case for setlist_track_ids to preserve tristate null/empty list/full list logic for never searched,
    // searched and found none previously, and has setlist tracks
    // redis client can't handle nulls, so when we insert we do as string and then coerce into real null on the way out
    const redisArtist: any = {
        spotify_url : external_urls.spotify,
        genres : JSON.stringify(genres),
        combined_genres : combined_genres ? JSON.stringify(combined_genres) : "[]",
        top_track_ids : top_track_ids ? JSON.stringify(top_track_ids) : "[]",
        newest_track_ids : newest_track_ids ? JSON.stringify(newest_track_ids) : "[]",
        setlist_track_ids : setlist_track_ids ? JSON.stringify(setlist_track_ids) : "null",
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
