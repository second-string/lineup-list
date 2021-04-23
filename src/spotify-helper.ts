import redis from "redis";

import * as constants from "./constants";
import * as helpers   from "./helpers";

export const spotifyAuth = () =>
    "Basic " + Buffer.from(`${constants.clientId}:${constants.clientSecret}`).toString("base64");
let spotifyToken: string = null;

async function refreshSpotifyToken() {
    const postOptions = {
        method : "POST",
        body : {grant_type : "client_credentials"},
        headers : {"Content-type" : "application/x-www-form-urlencoded", Authorization : spotifyAuth()}
    };

    console.log("Getting spotify API token...");
    const {success, response} =
        await helpers.instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    return success ? response.access_token : response;
}

// Enables other logic to get spotify information without having to store and handle refreshing the token themselves
async function autoRetrySpotifyCall(url: string, createOptions: (token: string) => any, logCurl: boolean):
    Promise<{success : boolean, response : any}> {
    if (!spotifyToken) {
        spotifyToken = await refreshSpotifyToken();
    }

    let options = createOptions(spotifyToken);

    let {success, response} = await helpers.instrumentCall(url, options, logCurl);
    if (!success) {
        // This could probably be refined with error codes, but give it a refresh and retry for any failure for now
        console.log(`Failed a spotify request to ${url} with status ${response.status}, refreshing token and retrying`);
        spotifyToken = await refreshSpotifyToken();
        options      = createOptions(spotifyToken);
        ({success, response} = await helpers.instrumentCall(url, options, logCurl));
    }

    return {success, response};
}

export async function getAccessTokenFromCallback(code: string, reqError: any):
    Promise<{error : Error, access : string, refresh : string}> {
    if (code === undefined && reqError) {
        console.log(`Error getting preliminary auth code from spoot: ${reqError}`);
        const error =
            Error("Playlist generation failed. You must authorize spotify access to have a playlist created for you.");
        return {error, access : null, refresh : null};
        // return res.send();
    } else if (code === undefined) {
        console.log(`Shit is borked - no error nor code from spoot prelim auth.`);
        const error = Error("Server error, please try again.");
        return {error, access : null, refresh : null};
        // return res.status(500).send("Server error, please try again.");
    }

    const redirectBaseUri = process.env.DEPLOY_STAGE === "PROD" ? "lineuplist.brianteam.dev" : "localhost";
    const postOptions     = {
        method : "POST",
        body : {
            grant_type : "authorization_code",
            redirect_uri : `https://${
                redirectBaseUri}/spotify-auth-callback`,  // Doesn't matter, just needs to match what we sent previously
            code
        },
        headers : {"Content-type" : "application/x-www-form-urlencoded", Authorization : spotifyAuth()}
    };

    console.log("Getting spotify access and refresh tokens ...");
    const {success, response} =
        await helpers.instrumentCall("https://accounts.spotify.com/api/token", postOptions, false);
    if (!success) {
        console.log("Something went wrong with request for access/refresh spoot tokens");
        console.log(response);
        const error = Error("Server error, please try again.");
        return {error, access : null, refresh : null};
        // return res.status(500).send("Server error, please try again.");
    }

    const access  = response.access_token;
    const refresh = response.refresh_token;

    return {error : null, access, refresh};
}

export async function getSpotifyUserFromToken(accessToken: string): Promise<{error : Error, user : User}> {
    console.log("Getting user email from spotify using access token...");
    const getOptions = helpers.baseSpotifyHeaders("GET", accessToken);

    const {success, response} = await helpers.instrumentCall("https://api.spotify.com/v1/me", getOptions, false);
    if (!success) {
        console.log("Error getting user account using access token");
        console.error(response);
        const error = Error("Server error, please try again.");
        return {error, user : null};
        // return res.status(500).send("Server error, please try again.");
    }

    return {error : null, user : response as User};
}

export async function getSpotifyArtists(artistNames: string[]): Promise<SpotifyArtist[]> {
    const artistPromises: Promise<SpotifyArtist>[] = [];

    let lengthCorrection: number = 0;
    for (const artistName of artistNames) {
        if (artistName === '') {
            lengthCorrection++;
            continue;
        }

        const artistPromise: Promise<SpotifyArtist> = new Promise(async (resolve, reject) => {
            const {success, response} = await autoRetrySpotifyCall(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist`,
                (token: string) => helpers.baseSpotifyHeaders("GET", token),
                false);

            if (!success) {
                console.log(`Request to get artist ${artistName} failed with status ${response.status}`);
                resolve(null);
            } else if (response.artists && response.artists.items.length > 0) {
                // Take the first one, it's almost always correct
                response.artists.items[0].combined_genres = reduceSpotifyGenres(response.artists.items[0].genres);
                resolve(response.artists.items[0]);
            } else {
                console.log(`No artists found for search term '${artistName}'`);
                resolve(null);
            }
        });

        artistPromises.push(artistPromise);
    }

    let artistObjs = await Promise.all(artistPromises);
    artistObjs     = artistObjs.filter(x => x !== null);

    console.log(`Received ${artistObjs.length} artists from ${artistNames.length - lengthCorrection} lineup artists`);
    return artistObjs;
}

export function getAllTracksForArtist(spotifyArtist: SpotifyArtist): Promise<SpotifyTrack[]> {
    return new Promise(async (resolve, reject) => {
        const {success, response} =
            await autoRetrySpotifyCall(`https://api.spotify.com/v1/artists/${spotifyArtist.id}/top-tracks?country=US`,
                                       (token: string) => helpers.baseSpotifyHeaders("GET", token),
                                       false);

        if (success === undefined || !success) {
            console.log(`Error getting tracks for artist '${spotifyArtist.name}'`);
            return reject(response);
        }

        resolve(response.tracks);
    });
}

export function getAllAlbumsForArtist(spotifyArtist: SpotifyArtist): Promise<SpotifyAlbum[]> {
    return new Promise(async (resolve, reject) => {
        const {success, response} = await autoRetrySpotifyCall(
            `https://api.spotify.com/v1/artists/${spotifyArtist.id}/albums?market=US&limit=50`,
            (token: string) => helpers.baseSpotifyHeaders("GET", token),
            false);

        if (success === undefined || !success) {
            console.log(`Error getting albums for artist '${spotifyArtist.name}'`);
            return reject(response);
        }

        resolve(response.items);
    });
}

export function getAllTracksForAlbum(spotifyAlbum: SpotifyAlbum): Promise<SpotifyTrack[]> {
    return new Promise(async (resolve, reject) => {
        const {success, response} =
            await autoRetrySpotifyCall(`https://api.spotify.com/v1/albums/${spotifyAlbum.id}/tracks?market=US&limit=10`,
                                       (token: string) => helpers.baseSpotifyHeaders("GET", token),
                                       false);

        if (success === undefined || !success) {
            console.log(`Error getting tracks for album ${spotifyAlbum.name} (${spotifyAlbum.id})`)
            return reject(response);
        }

        // When getting tracks for an album, the album field is not populated on spotify's end (since we needed to know
        // it to request obviously). Bundle it in for our code's use
        for (const track of response.items) {
            track.album = spotifyAlbum;
        }

        resolve(response.items);
    });
}

export async function getAllTracksToAdd(spotifyArtists: SpotifyArtist[],
                                        tracksPerArtist: number): Promise<SpotifyTrack[]> {
    const trackPromises: Promise<SpotifyTrack[]>[] = [];
    for (const spotifyArtist of spotifyArtists) {
        const trackPromise = getAllTracksForArtist(spotifyArtist);
        trackPromises.push(trackPromise);
    }

    // initially get a list of lists from each individual promise resolving the 3 tracks for the artist
    const trackObjects: SpotifyTrack[][] = await Promise.all(trackPromises);
    const trackUris                      = trackObjects.reduce((list: SpotifyTrack[], trackUriList: SpotifyTrack[]) => {
        list = list.concat(trackUriList.slice(0, tracksPerArtist));
        return list;
    }, []);

    console.log(`Received ${trackUris.length} tracks`);
    return trackUris;
}

export async function getOrCreatePlaylist(
    accessToken: string,
    spotifyUsername: string,
    playlistName: string,
    ): Promise<SpotifyPlaylist> {
    // Page through getting playlists 50 at a time
    let playlists: SpotifyPlaylist[] = [];
    let url                          = "https://api.spotify.com/v1/me/playlists?limit=50";
    let hasNext                      = false;
    do {
        const currentPlaylistsResponse =
            await helpers.instrumentCall(url, helpers.baseSpotifyHeaders("GET", accessToken), false);
        if (currentPlaylistsResponse.success === undefined || !currentPlaylistsResponse.success) {
            console.log(`Error getting playlist for current user`);
            console.log(currentPlaylistsResponse.response);
            throw new Error();
        }

        playlists = playlists.concat(currentPlaylistsResponse.response.items);
        url       = currentPlaylistsResponse.response.next;
        hasNext   = url !== null;
    } while (hasNext);

    let playlistObj =
        playlists.find(x => x.name === playlistName && x.owner.id === 'bteamer' /*userObj.SpotifyUsername*/);
    if (playlistObj === undefined) {
        // They don't have their own lineup list playlist yet, create it
        const postOptions: any = helpers.baseSpotifyHeaders("POST", accessToken);
        postOptions.body       = {name : playlistName, public : false, description : "helloaf"};

        console.log("Creating playlist since we didn't find it in their list of existing playlists");
        const createPlaylistResponse = await helpers.instrumentCall(
            `https://api.spotify.com/v1/users/${
            'bteamer' /*userObj.SpotifyUsername*/}/playlists`,
            postOptions,
            false);

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

export async function addTracksToPlaylist(accessToken: string, playlistObj: SpotifyPlaylist, trackUris: string[]):
    Promise<boolean> {
    const options: any = helpers.baseSpotifyHeaders("PUT", accessToken);
    for (let i = 0; i <= Math.floor(trackUris.length / 100); i++) {
        // PUT overwrites all other tracks in the playlist
        options.body = {uris : trackUris.slice(i * 100, i * 100 + 99)};

        // Stop overwriting after first set of tracks
        if (i !== 0) {
            options.method = "POST";
        }

        // This response gives us an object with a single 'snapshot_id' element, who cares
        const addTracksResponse =
            await helpers.instrumentCall(`https://api.spotify.com/v1/playlists/${playlistObj.id}/tracks`,
                                         options,
                                         false);
        if (addTracksResponse.success === undefined || !addTracksResponse.success) {
            console.log("Error adding tracks to playlist");
            console.log(addTracksResponse.response);
            return false;
        }

        console.log(`Added a page of tracks to playlist: ${i * 100} to ${i * 100 + 99}`);
    }

    return true;
}

export async function getTrackById(trackId: string): Promise<SpotifyTrack> {
    const createOptions = (token: string) => helpers.baseSpotifyHeaders("GET", token);
    return new Promise(async (resolve, reject) => {
        const {success, response} =
            await autoRetrySpotifyCall(`https://api.spotify.com/v1/tracks/${trackId}`, createOptions, false);

        if (success === undefined || !success) {
            console.log(`Error getting track for track ID '${trackId}'`);
            return reject(response);
        }

        resolve(response);
    });
}

export async function getArtistById(artistId: string): Promise<SpotifyArtist> {
    const createOptions = (token: string) => helpers.baseSpotifyHeaders("GET", token);
    return new Promise(async (resolve, reject) => {
        await helpers.sleep(200)
        const {success, response} =
            await autoRetrySpotifyCall(`https://api.spotify.com/v1/artists/${artistId}`, createOptions, false);

        if (success === undefined || !success) {
            console.log(`Error getting artist for artist ID '${artistId}'`);
            return reject(response);
        }

        response.combined_genres = reduceSpotifyGenres(response.genres);

        resolve(response);
    });
}

function reduceSpotifyGenres(allArtistGenres: string[]): string[] {
    // js prefix tree?
    const newArtistGenres: string[] = [];
    for (const specificGenre of allArtistGenres) {
        let matchedOneMain: boolean = false;
        for (const mainGenre of constants.mainGenres) {
            if (specificGenre.includes(mainGenre)) {
                // Right now  we're always looping through every main genre. This means we are
                // adding multiple main genres for a multiple-matching specific genre.
                if (!newArtistGenres.includes(mainGenre)) {
                    newArtistGenres.push(mainGenre);
                }
                matchedOneMain = true;
            }
        }

        // If we didn't match any mains, add the specific one so we can still use it in  artist filtering in the UI
        if (!matchedOneMain) {
            newArtistGenres.push(specificGenre);
        }
    }

    return newArtistGenres;
}
