declare namespace Express {
    export interface Request {
        sessionUid: string;
    }
}

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
    combined_genres: string[];  // Not a spotify field. Our list of genres containing any main genres it as matched plus
                                // the loeftover unmatched ones
    day?: string;  // Not a spotify field, will be set differently for each festival this artist is attending
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
    combined_genres: string;
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
    years: number[];
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
}
