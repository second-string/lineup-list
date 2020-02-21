import redis from "redis";

import * as spotifyHelper from "./spotify-helper";
import * as redisHelper from "./redis-helper";

// Need to export reduceSpotifyGenres from redishelper and spotifyToRedisArtist / redisToSpotifyArtist from spotifyhelper to run

// const redisClient = redis.createClient();
// redisClient.keys("artist:*", (err: Error, artists: string[]) => {
//     for (const artist of artists) {
//         redisClient.hgetall(artist, (err: Error, artistObj: any) => {
//             const spotifyArtist = redisHelper.redisToSpotifyArtist(artistObj);
//             // console.log(spotifyArtist.genres);
//             const combinedGenres = spotifyHelper.reduceSpotifyGenres(spotifyArtist.genres);
//             // console.log(combinedGenres);
//             // console.log('----------');
//             spotifyArtist.combined_genres = combinedGenres;
//             const redisArtist: any = redisHelper.spotifyToRedisArtist(spotifyArtist);
//             redisClient.hmset(artist, redisArtist, redis.print);
//         });
//     }
// });
