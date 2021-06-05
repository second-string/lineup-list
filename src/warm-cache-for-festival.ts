import {existsSync, readFileSync} from "fs";
import redis from "redis";

import * as redisHelper   from "./redis-helper";
import * as spotifyHelper from "./spotify-helper";

async function warm(festival: string, years: number[]) {
    const redisClient = redis.createClient();

    for (const year of years) {
        const filename: string = festival + "_" + year + ".txt";
        let file;
        if (existsSync(filename)) {
            file = readFileSync(filename, "utf-8");
        } else if (existsSync(`lineups/${filename}`)) {
            file = readFileSync(`lineups/${filename}`, "utf-8");
        } else if (existsSync(`../lineups/${filename}`)) {
            file = readFileSync(`../lineups/${filename}`, "utf-8");
        } else {
            console.error(`File ${filename} not found`);
            return;
        }

        const artistLines                           = file.split('\n');
        const artistObjs: {[key: string]: string[]} = {};
        for (const artistLine of artistLines) {
            // Skip blank lines
            if (!artistLine.trim()) {
                console.log("Skipping newline");
                continue;
            }
            const artistDetails: string[] = artistLine.split(",");
            const artistName              = artistDetails[0];
            let day                       = artistDetails[1];

            // If we don't have days in our text file yet, list everything under day zero
            if (!day) {
                day = "0";
            }

            if (artistObjs[day] && artistObjs[day].length) {
                artistObjs[day].push(artistName);
            } else {
                artistObjs[day] = [ artistName ];
            }
        }

        // Save all days so we can pull them later
        redisClient.set(`festival:${festival.toLowerCase()}_${year}:days`,
                        JSON.stringify(Object.keys(artistObjs)),
                        redis.print);

        // For every day in this fest, get the full spot artist obj from the text file name, store ID list for each
        // artist on this specific day key, then save artist objs themselves
        for (const day of Object.keys(artistObjs)) {
            const artists: SpotifyArtist[] = await spotifyHelper.getSpotifyArtists(artistObjs[day]);

            // Set our list of artist IDs with a key of the festival name_year
            const artistIds: string[] = artists.map(x => x.id);
            console.log(`festival:${festival.toLowerCase()}_${year}:${day}`);
            redisClient.set(`festival:${festival.toLowerCase()}_${year}:${day}`,
                            JSON.stringify(artistIds),
                            redis.print);

            for (const spotifyArtist of artists) {
                // Check to see if we have this artist and associated metadata saved in cache from a previous warm run
                // already. This might let us skip getting top/new/setlist tracks if we already have them saved
                const redisArtistPromise = new Promise<RedisArtist>((resolve, reject) => {
                    redisClient.hgetall(`artist:${spotifyArtist.id}`, async (err: Error, obj: any) => {
                        if (err) {
                            return reject(err);
                        } else {
                            // Tag each artist with the day for this festival so we can group when resolving all
                            // promises. If it's null, still resolve, but we need to go get the artist
                            if (obj) {
                                obj.day = day;
                            }
                            resolve(obj);
                        }
                    });
                });

                let redisArtist: RedisArtist                                                 = await redisArtistPromise;
                let                                  spotifyArtistToGetTracks: SpotifyArtist = null;
                // If we didn't have it, no sweat, convert our spotify. We'll have to go get all 3 track types
                if (!redisArtist) {
                    redisArtist = redisHelper.spotifyToRedisArtist(spotifyArtist);
                    redisClient.hmset(`artist:${redisArtist.id}`, redisArtist as any, (redisErr: Error, res) => {
                        if (redisErr) {
                            console.error(`redis error: ${redisErr}`);
                        }
                    });

                    spotifyArtistToGetTracks = spotifyArtist;
                } else {
                    spotifyArtistToGetTracks = redisHelper.redisToSpotifyArtist(redisArtist);
                }

                // Then get top, new, and setlist tracks for this artist. This will take a while even with no backoffs
                // if we didn't have this artist previously. Don't save return values, we don't care. Do setlists before
                // new tracks to help with backoff
                if (spotifyArtistToGetTracks.id === undefined) {
                    console.log(spotifyArtistToGetTracks);
                    console.log("------------------");
                    console.log(redisArtist);
                }
                await redisHelper.getTopTracksForArtist(redisClient, spotifyArtistToGetTracks, 10);
                await redisHelper.getSetlistTracksForArtist(redisClient, spotifyArtistToGetTracks, 10);
                await redisHelper.getNewestTracksForArtist(redisClient, spotifyArtistToGetTracks, 10);
            }
        }
    }

    redisClient.quit();
}

async function main() {
    // A dict of each festival holding all the years we support for that festival
    const supportedFestivals: {[key: string]: number[]} = {
        "coachella" : [ 2020 ],
        "bottlerock" : [ 2021, 2020 ],
        "osl" : [ 2021, 2019 ],
        "hardsummer" : [ 2021 ],
        "bonnaroo" : [ 2021 ],
        "govball" : [ 2021 ],
        "ohana" : [ 2021 ],
        "riot" : [ 2021 ],
        "firefly" : [ 2021 ],
        "pitchfork" : [ 2021 ],
        "lollapalooza" : [ 2021 ],
        "acl" : [ 2021 ],
        "shaky" : [ 2021 ],
        "ezoo" : [ 2021 ],
        "iii" : [ 2021 ],
    };

    let festivals: {[key: string]: number[]};
    if (process.argv.length > 2) {
        const festival: string = process.argv[2];
        const yearStr: string  = process.argv[3];
        if (!Object.keys(supportedFestivals).includes(festival)) {
            console.log(`Did not find ${festival} in list of supported festivals`);
            process.exit(1);
        }

        const year: number = parseInt(yearStr, 10);
        if (!supportedFestivals[festival].includes(year)) {
            console.log(`Year ${year} not supported for ${festival}`);
            process.exit(1);
        }

        festivals = { [festival] : [ year ] }
    } else {
        festivals = supportedFestivals;
    }

    for (const festivalName of Object.keys(festivals)) {
        await warm(festivalName, festivals[festivalName]);
    }
}

main()
