interface SpotifyArtist {
    genres: string[];
    href: string;
    id: string;
    name: string;
    popularity: number;
    type: string;
    uri: string;
}

interface SpotifyTrack {
    album: any;
    artists: any[];
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
}

interface SpotifyPlaylist {
    collaborative: boolean;
    description:   string;
    followers:     any[];
    href:          string;
    id:            string;
    name:          string;
    owner:         any;
    public:        null;
    snapshot_id:   string;
    tracks:        any[];
    type:          string;
    uri:           string;
}

interface User {

}
