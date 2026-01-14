// *******************
// 03/12/22
// Unused - leaving in case easy playlist creation is needed again, but playlist creation flow is handled fully in
// /spotify-auth-callback route handler in api.ts
// *******************

/*
import {readFileSync} from 'fs';

import * as spotifyHelper from "./spotify-helper";

async function main(): Promise<void> {
    const file        = readFileSync("Coachella_2020_full.txt", "utf-8");
    const artistNames = file.split('\n');

    // const spotifyToken = await getSpotifyToken();
    const spotifyToken: string            = "";
    const spotifyArtists: SpotifyArtist[] = await spotifyHelper.getSpotifyArtists(artistNames);
    const artistSongs: SpotifyTrack[]     = await spotifyHelper.getAllTracksToAdd(spotifyArtists, 3);
    const                                     songUrisToAdd: string[] = artistSongs.map(x => x.uri);
    const playlist = await spotifyHelper.getOrCreatePlaylist(spotifyToken, "Coachella 2020 - Lineup List", null);
    await                  spotifyHelper.addTracksToPlaylist(spotifyToken, playlist, songUrisToAdd);
}

try {
    main();
} catch (e) {
    throw e;
}
*/
