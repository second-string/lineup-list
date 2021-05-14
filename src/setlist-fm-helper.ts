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
        console.error(response);
        return [];
    }
}

export async function getTrackNamesFromSetlists(mbArtistId: string, numTracks: number): Promise<SetlistFmSong[]> {
    const setlists: SetlistFmSetlist[] = await getArtistSetlists(mbArtistId);

    // We could sort on date but it looks like they come down that way already
    // TODO :: will need to make sure we have enough songs on the setlist, or concat ~10 songs across all most recent
    // setlists
    // TODO :: we also will need to do the .filter(x => !x.cover) logic here if we're going to, to make sure we still
    // hit the full numTracks returned. It might not be a great idea though, bceause artists like kaytranada get a ton
    // of their stuff filtered out. ALTHOUGH now that I'm running it with no cover filter, spotify api search cannot
    // find things like song name: kiss it better - kaytranada edition when the artist is still rihanna. So the
    // fuzzysearch of the gui search bar is not the same as api, so I think we have to respect anti cover checking

    // Iterate through every setlist until we at least get one with songs in a setlist
    for (const setlist of setlists) {
        if (setlist.sets && setlist.sets.set && setlist.sets.set.length > 0 && setlist.sets.set[0] &&
            setlist.sets.set[0].song && setlist.sets.set[0].song.length > 0) {
            return setlist.sets.set[0].song.slice(0, numTracks);
        }
    }

    console.error(`Didn't find any setlist either of length > 0 or any valid setlist objs for MBID ${mbArtistId}`);
    // console.dir(setlists, {depth : null});
    return [];
}
