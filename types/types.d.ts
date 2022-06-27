declare namespace Express {
    export interface Request {
        sessionUid: string;
    }
}

// the musicbrainz-api package includes types in it, but not exposed for external typescript use. We want to use them
// anyway
//
/// <reference path="../node_modules/musicbrainz-api/lib/musicbrainz-api.d.ts" />
/// <reference path="../node_modules/musicbrainz-api/lib/musicbrainz.types.d.ts" />

interface SpotifyArtist {
    genres: string[];
    href: string;
    id: string;
    name: string;
    popularity: number;
    type: string;
    uri: string;
    external_urls: SpotifyExternalUrls;
    images: any;
    followers: any;
    top_track_ids: string[];  // Not a spotify field, I'm glomming it on here from what's saved in redis to save a query
    album_ids: string[];      // Same as top_track_ids
    newest_track_ids: string[];   // Same as top_track_ids
    setlist_track_ids: string[];  // Same as top_track_ids
    combined_genres: string[];  // Not a spotify field. Our list of genres containing any main genres it as matched plus
                                // the loeftover unmatched ones
    day?: string;         // Not a spotify field, will be set differently for each festival this artist is attending
    checkedStr?: string;  // Not a spotify field, used to render customize page with session data
}

interface RedisArtist {
    genres: string;  // stringified list
    href: string;
    id: string;
    name: string;
    popularity: number;
    type: string;
    uri: string;
    spotify_url: string;  // parsed out of the external_urls for a SpotifyArtist
    top_track_ids: string;
    newest_track_ids: string;
    setlist_track_ids: string;
    album_ids: string;
    combined_genres: string;
}

interface SpotifyTrack {
    album: any;
    artists: SpotifyArtist[];
    available_markets: string[];
    disc_number: number;
    duration_ms: number;
    explicit: boolean;
    href: string;
    id: string;
    is_local: boolean;
    is_playable: boolean;
    name: string;
    popularity: number;
    preview_url: string;
    track_number: number;
    type: string;
    uri: string;
    external_urls: SpotifyExternalUrls;
    external_ids: any;
}

interface RedisTrack {
    album: string;
    artists: string;            // stringified list of stringified artist object
    available_markets: string;  // stringified list, each market is a country code string ('CA', 'US')
    disc_number: number;
    duration_ms: number;
    explicit: boolean;
    href: string;
    id: string;
    is_local: boolean;
    is_playable: boolean;
    name: string;
    popularity: number;
    preview_url: string;
    track_number: number;
    type: string;
    uri: string;
    spotify_url: string;  // parsed out of the external_urls for a SpotifyTrack
}

interface SpotifyAlbum {
    album_group: string;
    album_type: string;
    artists: [];  // Might be SpotifyArtist but seems to have less fields at a glance
    external_urls: SpotifyExternalUrls;
    href: string;
    id: string;
    images: [ any ];
    name: string;
    release_date: string;            // Format YYY-mm-dd
    release_date_precision: string;  // day, month, year. Might be helpful
    total_tracks: number;
    type: string;
    uri: string;
}

interface RedisAlbum {
    album_group: string;
    album_type: string;
    artists: string;      // stringified list of stringified stripped down artist objects
    spotify_url: string;  // parsed out of the external_urls for a SpotifyTrack
    href: string;
    id: string;
    images: string;
    name: string;
    release_date: string;            // Format YYY-mm-dd
    release_date_precision: string;  // day, month, year. Might be helpful
    total_tracks: number;
    type: string;
    uri: string;
}

interface SpotifyPlaylist {
    collaborative: boolean;
    description: string;
    followers: any[];
    href: string;
    id: string;
    name: string;
    owner: any;

    public: null;
    snapshot_id: string;
    tracks: any[];
    type: string;
    uri: string;
}

// The external_urls object that comes with tracks or artist. We only ever want the spotify one
interface SpotifyExternalUrls {
    spotify: string
}

interface Festival {
    display_name: string;
    name: string;
    region: string;
    years: number[];
}

interface Region {
    display_name: string;
    name: string
}

interface User {
    display_name: string;
    external_urls: any;
    followers: any, href: string;
    id: string;  // username
    images: any[];
    type: string;
    uri: string;
}

interface SessionData {
    festivalName: string;
    festivalDisplayName: string;
    festivalYear?: number;
    tracksPerArtist?: number;
    artistIdsStr?: string;
    trackIdsStr?: string;
    playlistName?: string;
    trackType?: string;
    selectedDaysStr?: string;
    selectedGenresStr?: string;
    playlistUrl?: string;
}

// Exists to wrap an object being passed to hbs with data needed for rendering but not a part of the object itself. For
// example, passing a genre string to customize with the session knowledge of if itshould be checked or not, state is
// "checked" or "" and obj is the genre string
interface StatefulObject {
    state: string;
    obj: any;
}
