import { readFileSync } from 'fs';

import * as spotifyHelper from "./spotify-helper";

async function main(): Promise<void> {
    const file = readFileSync("Coachella_2020_full.txt", "utf-8");
    const artistNames = file.split('\n');

    // const spotifyToken = await getSpotifyToken();
    const spotifyToken: string = "BQDb08aKEUP28H2SvJ27CJ2qNW7PF3ILObugxgcVOamL6gi1xWz8QPDx2QFOsj2ADEZB84VicKPThCxlcz4xKxbXl54N0X5oaRn6tQF7fmp3cJdNoFJtUJum2ZR9VrHIy2Cf6nh5QQOTqw5EHfjWQ5u6JsvPRuKY9p5RGsFSttZa2qU4Qdm3Q3JVz3Qipjhmt4AenQenPmsHm3h0w_tQQrCzrxrH-ca9PX8Py_UCsxgoa94whGw";
    const spotifyArtists: SpotifyArtist[] = await spotifyHelper.getSpotifyArtists(spotifyToken, artistNames);
    const artistSongs: SpotifyTrack[] = await spotifyHelper.getAllTracksToAdd(spotifyToken, spotifyArtists);
    const songUrisToAdd: string[] = artistSongs.map(x => x.uri);
    const playlist = await spotifyHelper.getOrCreatePlaylist(spotifyToken, null);
    await spotifyHelper.addTracksToPlaylist(spotifyToken, playlist, songUrisToAdd);
}

try {
    main();
} catch (e) {
    throw e;
}
