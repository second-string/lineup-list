import {MusicBrainzApi} from 'musicbrainz-api';

import {spotifyBaseUrl} from "./spotify-helper";

const mbApi = new MusicBrainzApi({
    appName : "lineup-list",
    appVersion : "0.0.1",
    appContactInfo : "contact@lineuplist.live",
});

// TOP id: 5c9752c2-a455-48f6-9e00-47f74cd4a23f
export async function spotifyToMbArtistId(spotifyArtistId: string): Promise<MbIdResponse> {
    const spotifyArtistUrl = `${spotifyBaseUrl}artist/${spotifyArtistId}`;
    let res: any;
    const resObj: MbIdResponse = {id : null, statusCode : undefined};
    try {
        res = await mbApi.search('url', spotifyArtistUrl);

        // mbApi.search only returns on 2xx and just with the response, and throws on any other code.
        resObj.statusCode = 200;
    } catch (err) {
        // api reutrns 503 as "rate-limit", so handle differently than other error code throws
        const statusCode = err?.response?.statusCode;
        if (statusCode >= 500) {
            const retryAfter = err?.response?.headers?.["retry-after"];
            console.error(`mb-api returned ${statusCode} for spot ID ${spotifyArtistId}, retry-after: ${
                retryAfter ??
                "none"}`);
        } else {
            console.error(`Error ${
                statusCode ??
                ""} searching MusicBrainz for spotify artist '${spotifyArtistId}' (${spotifyArtistUrl}).`);
            if (err) {
                console.log(`Err code: ${err.code}: ${err.stack}`);
            }
        }

        resObj.statusCode = statusCode;
        resObj.id         = null;
        return resObj;
    }

    // TODO :: future support for searching by artist name on mbid, not using URL-based search
    if (res.urls.length === 0) {
        console.error(`No MB artist IDs found for spotify ID '${spotifyArtistId}'`);
        resObj.id = null;
        return resObj;
    }

    if (res.urls.length > 0 && res.urls[0]["relation-list"] && res.urls[0]["relation-list"].length > 0 &&
        res.urls[0]["relation-list"][0].relations && res.urls[0]["relation-list"][0].relations.length > 0 &&
        res.urls[0]["relation-list"][0].relations[0].artist && res.urls[0]["relation-list"][0].relations[0].artist.id) {
        resObj.id = res.urls[0]["relation-list"][0].relations[0].artist.id;
        return resObj;
    } else {
        console.error(`Could not find mbid for spotify artist ${spotifyArtistId}`);
        resObj.id = null;
        return resObj;
    }
}
