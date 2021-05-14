interface SetlistFmSong {
    name: string;
    info: string;
    cover?: any;  // If this exists, skip it - name search with band won't work in spotify
    with: any;    // mbid and artist info for features
}

interface SetlistFmSet {
    song: SetlistFmSong[];
}

interface SetlistFmSetsObj {
    set: SetlistFmSet[];
}

interface SetlistFmSetlist {
    artist: any;
    venue: any;
    tour: any;
    sets: SetlistFmSetsObj;
    info: string;
    url: string;
    id: string;
    versionId: string;
    eventDate: string;    // dd-MM-YYYY format
    lastUpdated: string;  // ISO date
}

interface SetlistFmSetlistsResponse {
    type: string;  // "setlists" for setlists
    total: number;
    page: number;
    itemsPerPage: number;
    setlist: SetlistFmSetlist[];
}
