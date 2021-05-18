import {instrumentCall} from "./helpers";

const baseUrl = "https://api.setlist.fm/rest/1.0/";

async function getArtistSetlists(artistMbid: string): Promise<SetlistFmSetlist[]> {
    const url  = `${baseUrl}artist/${artistMbid}/setlists`;
    const opts = {
        headers : {
            Accept : "application/json",
            "Accept-Language" : "en",
            "x-api-key" : process.env.SETLIST_FM_API_KEY,
        }
    };

    const {success, response} = await instrumentCall(url, opts, false);
    if (success) {
        const setlistsResponse: SetlistFmSetlistsResponse = response as SetlistFmSetlistsResponse;
        return setlistsResponse.setlist;
    } else {
        console.error(`Error getting setlists for ${artistMbid} from setlist.fm:`);
        console.error(`${response.status} - ${response.url}`);
        return [];
    }
}

export async function getTracksFromSetlists(mbArtistId: string): Promise<SetlistFmSong[]> {
    const setlists: SetlistFmSetlist[] = await getArtistSetlists(mbArtistId);

    // Iterate through every setlist until we find the first setlist with songs. Save 10 or more tracks so we have
    // a decent buffer without having to re-fetch. There will likely be duplicates if we need to use more than 1 setlist
    let songs: SetlistFmSong[] = [];
    for (const setlist of setlists) {
        if (setlist.sets && setlist.sets.set && setlist.sets.set.length > 0 && setlist.sets.set[0] &&
            setlist.sets.set[0].song && setlist.sets.set[0].song.length > 0) {
            // Add songs in, but don't take any ones with a cover key populated. The search will almost never return
            // any, or the correct, track on spotify
            songs = songs.concat(setlist.sets.set[0].song.filter(x => !x.cover));
        }

        // Don't care if it's more, but at least try to get 10
        if (songs.length >= 10) {
            break;
        }
    }

    return songs;
}
