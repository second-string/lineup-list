import redis from "redis";
import { readFileSync } from "fs";

import * as spotifyHelper from "./spotify-helper";

async function main() {
    const redisClient = redis.createClient();

    // A dict of each festival holding all the years we support for that festival
    const festivals: { [key: string]: string[] } = { "Coachella": ["2020"], "Bottlerock": ["2020"] };

    for (const festivalName of Object.keys(festivals)) {
        for (const festivalYear of festivals[festivalName]) {
            const filename: string = festivalName + "_" + festivalYear + ".txt";
            const file = readFileSync(filename, "utf-8");
            const artistNames = file.split('\n');

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
            redisClient.set(`festival:${festivalName.toLowerCase()}_${festivalYear}`, JSON.stringify(artistIds), redis.print);
        }
    }

    redisClient.quit();
}

main()
