import {readFileSync} from "fs";
import redis from "redis";

import * as spotifyHelper from "./spotify-helper";

async function warm(festival: string, years: number[]) {
    const redisClient = redis.createClient();

    for (const year of years) {
        const filename: string = festival + "_" + year + ".txt";
        const file             = readFileSync(filename, "utf-8");
        const artistNames      = file.split('\n');

        // const spotifyToken: string = await spotifyHelper.getSpotifyToken();
        const artists: SpotifyArtist[] = await spotifyHelper.getSpotifyArtists(artistNames);

        /*
        I'm kinda dumb v since we have to get the artists for their IDs anyway, I guess we might as well cache
        the artist object itself. Makes no difference since its from the same requests.

         If you feel like pre-loading all the artists, this will do it (albeit with some solid 429 backoff waiting).
         Otherwise the code in redis-helper will handle getting and caching any artists from the festival list of
         artist ids it doesn't have yet. Current implementation for that is a little nicer since it awaits each one,
         so you hit way less 429s and it ends up taking shorter overall.

        for (const artist of artists) {
            // Strip out all of the unsupported nested stuff
            const { external_urls, images, followers, genres, ...restOfArtist } = artist;

            // Store the spotify URL from external_urls cause we need that
            // For some reason redis refuses to accept this as a param to hmset if it's type is set?
            const redisArtist: any = {
                spotify_url: external_urls.spotify,
                genres: JSON.stringify(genres),
                ...restOfArtist
            };

            redisClient.hmset(`artist:${artist.id}`, redisArtist, redis.print);
        }
    */
        // Set our list of artist IDs with a key of the festival name_year
        const artistIds: string[] = artists.map(x => x.id);
        redisClient.set(`festival:${festival.toLowerCase()}_${year}`, JSON.stringify(artistIds), redis.print);
    }

    redisClient.quit();
}

async function main() {
    // A dict of each festival holding all the years we support for that festival
    const supportedFestivals:
        {[key: string]: number[]} = {"coachella" : [ 2020 ], "bottlerock" : [ 2020 ], "osl" : [ 2021, 2019 ]};

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
