import { readFileSync } from 'fs';
import fetch from 'node-fetch';

import * as helpers from "./helpers";
import * as constants from "./constants";

const spotifyAuth = () => "Basic " + Buffer.from(`${constants.clientId}:${constants.clientSecret}`).toString("base64");

async function getSpotifyToken() {
    const postOptions = {
        method: "POST",
        body: {
            grant_type: "client_credentials"
        },
        headers: {
            "Content-type": "application/x-www-form-urlencoded",
            Authorization: spotifyAuth()
        }
    };

    console.log("Getting spotify API token...");
    const { success, response } = await helpers.instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    return success ? response.access_token : response;
}

async function getSpotifyArtists(spotifyToken: string, artistNames: string[]): Promise<SpotifyArtist[]> {
    const getOptions = helpers.baseSpotifyHeaders("GET", spotifyToken);
    const artistPromises: Promise<SpotifyArtist>[] = [];

    for (const artistName of artistNames)
    {
        if (artistName === '') {
            continue;
        }

        const artistPromise: Promise<SpotifyArtist> = new Promise(async (resolve, reject) => {
            const { success, response } = await helpers.instrumentCall(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist`,
                 getOptions,
                 false);

            if (!success) {
                console.log(`Request to get artist ${artistName} failed with status ${response.status}`);
                resolve(null);
            } else if (response.artists && response.artists.items.length > 0) {
                // Take the first one, it's almost always correct
                resolve(response.artists.items[0]);
            } else {
                console.log(`No artists found for search term '${artistName}'`);
                resolve(null);
            }
        });

        artistPromises.push(artistPromise);
    }

    let artistObjs = await Promise.all(artistPromises);
    artistObjs = artistObjs.filter(x => x !== null);

    console.log(`Received ${artistObjs.length} artists from ${artistNames.length} lineup artists`);
    return artistObjs;
}

function getTracksForArtist(spotifyToken: string, spotifyArtist: SpotifyArtist): Promise<SpotifyTrack[]> {
    const getOptions = helpers.baseSpotifyHeaders("GET", spotifyToken);
    return new Promise(async (resolve, reject) => {
            await helpers.sleep(200)
            const { success, response } = await helpers.instrumentCall(
                `https://api.spotify.com/v1/artists/${spotifyArtist.id}/top-tracks?country=US`,
                 getOptions,
                 false);

            if (success === undefined || !success) {
                console.log(`Error getting tracks for artist '${spotifyArtist.name}'`);
                return reject(response);
            }

            resolve(response.tracks.slice(0, 3));
        });
}

async function getAllTracksToAdd(spotifyToken: string, spotifyArtists: SpotifyArtist[]): Promise<SpotifyTrack[]> {
    const getOptions = helpers.baseSpotifyHeaders("GET", spotifyToken);
    const trackPromises: Promise<SpotifyTrack[]>[] = [];
    for (const spotifyArtist of spotifyArtists) {
        const trackPromise = getTracksForArtist(spotifyToken, spotifyArtist);
        trackPromises.push(trackPromise);
    }

    // initially get a list of lists from each individual promise resolving the 3 tracks for the artist
    const trackObjects: SpotifyTrack[][] = await Promise.all(trackPromises);
    const trackUris = trackObjects
        .reduce((list: SpotifyTrack[], trackUriList: SpotifyTrack[]) => {
            list = list.concat(trackUriList);
            return list;
        }, []);

    console.log(`Received ${trackUris.length} tracks`);
    return trackUris;
}

async function getOrCreatePlaylist(spotifyToken: string, userObj: User): Promise<SpotifyPlaylist> {
    const getOptions = helpers.baseSpotifyHeaders("GET", spotifyToken);

    // Page through getting playlists 50 at a time
    let playlists: SpotifyPlaylist[] = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    let hasNext = false;
    do {
        const currentPlaylistsResponse = await helpers.instrumentCall(url, getOptions, false);
        if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
            console.log(`Error getting playlist for current user`);
            console.log(currentPlaylistsResponse.response);
            throw new Error();
        }

        playlists = playlists.concat(currentPlaylistsResponse.response.items);
        url = currentPlaylistsResponse.response.next;
        hasNext = url !== null;
    } while (hasNext);

    let playlistObj = playlists.find(x => x.name === "Lineup List" && x.owner.id === 'bteamer'/*userObj.SpotifyUsername*/);
    if (playlistObj === undefined) {
        // They don't have their own lineup list playlist yet, create it
        const postOptions: any = helpers.baseSpotifyHeaders("POST", spotifyToken);
        postOptions.body = {
            name: "Lineup List",
            public: false,
            description: "helloaf"
        };

        console.log("Creating playlist since we didn't find it in their list of existing playlists");
        const createPlaylistResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/users/${'bteamer'/*userObj.SpotifyUsername*/}/playlists`, postOptions, false);
        if (createPlaylistResponse === undefined || !createPlaylistResponse.success) {
            console.log(`Error creating playlist`);
            console.log(createPlaylistResponse.response);
            throw new Error();
        }

        playlistObj = createPlaylistResponse.response;
    } else {
        console.log("Found 'Lineup List' playlist in users playlists, overwriting")
    }

    return playlistObj;
}

async function addTracksToPlaylist(spotifyToken: string, playlistObj: SpotifyPlaylist, trackUris: string[]): Promise<void> {
    // PUT overwrites all other tracks in the playlist
    const putOptions: any = helpers.baseSpotifyHeaders("PUT", spotifyToken);

    for (let i = 0; i <= Math.floor(trackUris.length / 100); i++) {
        putOptions.body = {
            uris: trackUris.slice(i * 100, i * 100 + 99)
        };

        // Stop overwriting after first set of tracks
        if (i !== 0) {
            putOptions.method = "POST"
        }

        // This response gives us an object with a single 'snapshot_id' element, who cares
        const addTracksResponse = await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`, putOptions, false);
        if (addTracksResponse.success === undefined || !addTracksResponse.success) {
            console.log("Error adding tracks to playlist");
            console.log(addTracksResponse.response);
            throw new Error();
        }

        console.log(`Added a page of tracks to playlist: ${i * 100} to ${i * 100 + 99}`);
    }
}

async function main(): Promise<void> {
    const file = readFileSync("Coachella_2020_full.txt", "utf-8");
    const artistNames = file.split('\n');

    // const spotifyToken = await getSpotifyToken();
    const spotifyToken: string = "BQDb08aKEUP28H2SvJ27CJ2qNW7PF3ILObugxgcVOamL6gi1xWz8QPDx2QFOsj2ADEZB84VicKPThCxlcz4xKxbXl54N0X5oaRn6tQF7fmp3cJdNoFJtUJum2ZR9VrHIy2Cf6nh5QQOTqw5EHfjWQ5u6JsvPRuKY9p5RGsFSttZa2qU4Qdm3Q3JVz3Qipjhmt4AenQenPmsHm3h0w_tQQrCzrxrH-ca9PX8Py_UCsxgoa94whGw";
    const spotifyArtists: SpotifyArtist[] = await getSpotifyArtists(spotifyToken, artistNames);
    const artistSongs: SpotifyTrack[] = await getAllTracksToAdd(spotifyToken, spotifyArtists);
    const songUrisToAdd: string[] = artistSongs.map(x => x.uri);
    const playlist = await getOrCreatePlaylist(spotifyToken, null);
    await addTracksToPlaylist(spotifyToken, playlist, songUrisToAdd);
}

try {
    main();
} catch (e) {
    throw e;
}
