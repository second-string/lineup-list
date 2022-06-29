export const clientId: string     = process.env.CLIENT_ID;
export const clientSecret: string = process.env.CLIENT_SECRET;
export const mainGenres: string[] = [
    "house", "dance", "emo",    "hip hop", "metal",      "r&b",   "rock",  "pop",   "indie",
    "punk",  "house", "soul",   "jazz",    "electronic", "rap",   "trap",  "disco", "techno",
    "edm",   "folk",  "trance", "funk",    "k-pop",      "latin", "reggae"
];

export const regions: Region[] = [
    {display_name : "Americas", name : "am"},
    {display_name : "Asia Pacific", name : "ap"},
    {display_name : "Europe", name : "eu"},
    {display_name : "Middle East/Africa", name : "me"},
];
