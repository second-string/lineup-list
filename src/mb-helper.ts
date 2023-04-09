import {MusicBrainzApi} from 'musicbrainz-api';

import {spotifyBaseUrl} from "./spotify-helper";

const mbApi = new MusicBrainzApi({
    appName : "lineup-list",
    appVersion : "0.0.1",
    appContactInfo : "contact@lineuplist.live",
});

// TOP id: 5c9752c2-a455-48f6-9e00-47f74cd4a23f
export async function spotifyToMbArtistId(spotifyArtistId: string): Promise<string> {
    const spotifyArtistUrl = `${spotifyBaseUrl}artist/${spotifyArtistId}`;
    const res: any = await mbApi.search('url', spotifyArtistUrl);

    // TODO :: future support for searching by artist name on mbid, not using URL-based search
    if (res.urls.length === 0) {
        console.error(`No MB artist IDs found for spotify ID '${spotifyArtistId}'`);
        return null;
    }

    if (res.urls.length > 0 && res.urls[0]["relation-list"] && res.urls[0]["relation-list"].length > 0 &&
        res.urls[0]["relation-list"][0].relations && res.urls[0]["relation-list"][0].relations.length > 0 &&
        res.urls[0]["relation-list"][0].relations[0].artist && res.urls[0]["relation-list"][0].relations[0].artist.id) {
        return res.urls[0]["relation-list"][0].relations[0].artist.id;
    } else {
        console.error(`Could not find mbid for spotify artist ${spotifyArtistId}`);
        return null;
    }
}
