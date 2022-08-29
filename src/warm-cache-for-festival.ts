import Ajv, {JSONSchemaType} from "ajv"
import {existsSync, readFileSync, statSync} from "fs";
import path from "path";
import redis from "redis";
import yaml from "yaml";

import * as constants     from "./constants";
import * as redisHelper   from "./redis-helper";
import * as spotifyHelper from "./spotify-helper";

interface LineupDay {
    number: number
    display_name: string
    date: Date
    artists: ArtistAndUri[]
}

interface FestivalLineup {
    display_name: string
    slug: string
    year: number
    days: LineupDay[]
}

async function warm(festival: string, years: number[]) {
    const redisClient = redis.createClient();

    for (const year of years) {
        const paths    = [ '', 'lineups/', '../lineups/' ];
        const filename = festival + "_" + year;

        let filePath;
        let file;
        let mtime;

        // start looking for .yaml format
        for (const pathString of paths) {
            filePath = path.join(pathString, filename) + ".yaml";
            if (existsSync(filePath)) {
                file  = readFileSync(filePath, "utf-8");
                mtime = statSync(filePath).mtime;
                break;
            }
        }

        // if not found, then move on to .txt file formats
        if (!file) {
            for (const pathString of paths) {
                filePath = path.join(pathString, filename) + ".txt";
                if (existsSync(filePath)) {
                    file  = readFileSync(filePath, "utf-8");
                    mtime = statSync(filePath).mtime;
                    break;
                }
            }
        }

        if (!file) {
            console.error(`File ${filename}.yaml / ${filename}.txt not found`);
            process.exit(1);
        }

        console.log(`Loading file ${filePath}`)

        const artistObjs: {[key: string]: ArtistAndUri[]} = {};

        // process files according to txt or yaml format
        if (filePath.endsWith("txt")) {
            const artistLines = file.split('\n');

            for (const artistLine of artistLines) {
                // Skip blank lines
                if (!artistLine.trim()) {
                    console.log("Skipping newline");
                    continue;
                }

                const artistDetails: string[] = artistLine.split(",");
                const artistName              = artistDetails[0];
                let   day                     = artistDetails[1];

                if (artistDetails.length > 2) {
                    console.error(`Line appears to contain too many commas - ${artistDetails}`);
                    process.exit(1);
                }

                // If we don't have days in our text file yet, list everything under day zero
                if (!day) {
                    day = "0";
                }

                if (artistObjs[day] && artistObjs[day].length) {
                    artistObjs[day].push({name : artistName});
                } else {
                    artistObjs[day] = [ {name : artistName} ];
                }
            }
        } else {
            // yaml mode

            // the yaml library will do some basic validation on parsing and throw errors/warnings on incorrectly
            // structured YAML
            const data: FestivalLineup = yaml.parse(file);

            // the AJV library is used for comparison against an actual lineup schema file
            const ajv = new Ajv();

            const schema: JSONSchemaType<FestivalLineup> = JSON.parse(readFileSync('lineup-schema.json').toString());

            const validate = ajv.compile(schema);

            if (!validate(data)) {
                console.error(`Lineup file failed schema validation`);
                console.error(validate.errors);
                process.exit(1);
            }

            // while we don't yet load the festival data dynamically from the file, we can at least check that it
            // matches to what we expect
            if (data.slug !== festival || data.year !== year) {
                console.error(`Lineup file festival data (${data.slug} / ${data.year}) does not match filename ${
                    festival} / ${year}`);
                process.exit(1);
            }

            // check that if we have day number = 0, we don't have any other days (as 0 indicates no day-based lineups)
            const allDayNumbers: number[] = data.days.map(day => day.number);

            if (allDayNumbers.includes(0) && allDayNumbers.length > 1) {
                console.error(
                    `Lineup files containing a day with number=0 should only have a single day, but there appear to be ${
                        allDayNumbers.length}`);
                process.exit(1);
            }

            // load the days/lineups, per the text format
            for (const day of data.days) {
                for (const artist of day.artists) {
                    if (artistObjs[day.number] && artistObjs[day.number].length) {
                        artistObjs[day.number].push(artist);
                    } else {
                        artistObjs[day.number] = [ artist ];
                    }
                }
            }
        }

        // Save all days so we can pull them later
        redisClient.set(`festival:${festival.toLowerCase()}_${year}:days`,
                        JSON.stringify(Object.keys(artistObjs)),
                        redis.print);

        // For every day in this fest, get the full spot artist obj from the text file name, store ID
        // list for each artist on this specific day key, then save artist objs themselves
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
                            // Tag each artist with the
                            // day for this festival so
                            // we can group when
                            // resolving all promises.
                            // If it's null, still
                            // resolve, but we need to
                            // go get the artist
                            if (obj) {
                                obj.day = day;
                            }
                            resolve(obj);
                        }
                    });
                });

                let redisArtist: RedisArtist                                                 = await redisArtistPromise;
                let                                  spotifyArtistToGetTracks: SpotifyArtist = null;
                // If we didn't have it, no sweat, convert our spotify. We'll have to go
                // get all 3 track types
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

                // Then get top, new, and setlist tracks for this artist. This will take
                // a while even with no backoffs if we didn't have this artist
                // previously. Don't save return values, we don't care. Do setlists
                // before new tracks to help with backoff
                if (spotifyArtistToGetTracks.id === undefined) {
                    console.log(spotifyArtist);
                    console.log("------------------");
                    console.log(redisArtist);
                    console.log("------------------");
                    console.log(spotifyArtistToGetTracks);
                    console.log("------------------");
                    console.log(redisArtist);
                    continue;
                }
                await redisHelper.getTopTracksForArtist(redisClient, spotifyArtistToGetTracks, 10, true);
                await redisHelper.getSetlistTracksForArtist(redisClient, spotifyArtistToGetTracks, 10, true);
                await redisHelper.getNewestTracksForArtist(redisClient, spotifyArtistToGetTracks, 10, true);
            }
        }

        redisClient.set(`festival:${festival.toLowerCase()}_${year}:last_updated_date`,
                        JSON.stringify(mtime),
                        redis.print);
    }

    redisClient.quit();
}

async function main() {
    if (!process.env.DEPLOY_STAGE || process.env.DEPLOY_STAGE === '') {
        console.log("Need to source setup_env.sh to set env variables");
        process.exit(1);
    }

    if (process.argv.length > 2) {
        const festivalName: string = process.argv[2];
        const yearStr: string      = process.argv[3];

        const festival = constants.supportedFestivals.find(f => f.name === festivalName)

        if (!festival) {
            console.log(`Did not find ${festivalName} in list of supported festivals`);
            process.exit(1);
        }

        let yearOrYears: number[];
        if (yearStr) {
            const year: number = parseInt(yearStr, 10);
            if (!festival.years.includes(year)) {
                console.log(`Year ${year} not supported for ${festivalName}`);
                process.exit(1);
            }

            yearOrYears = [ year ];
        } else {
            // Festival name specified but not year, warm all supported years for this festival
            yearOrYears = festival.years;
        }

        await warm(festivalName, yearOrYears);

    } else {
        for (const festival of constants.supportedFestivals) {
            await warm(festival.name, festival.years);
        }
    }
}

main()
