import express from "express";
import {Router} from "express";
import {readFileSync} from 'fs';
import hbs from "handlebars";
import redis from "redis";

import * as constants   from "../constants";
import * as redisHelper from "../redis-helper";

const supportedFestivals: Festival[] = [
    {display_name : "Coachella", years : [ 2022, 2020 ], name : "coachella"},
    {display_name : "Bottlerock", years : [ 2022, 2021, 2020 ], name : "bottlerock"},
    {display_name : "Outside Lands", years : [ 2021, 2019 ], name : "osl"},
    {display_name : "Bonnaroo", years : [ 2022, 2021 ], name : "bonnaroo"},
    {display_name : "Hard Summer", years : [ 2021 ], name : "hardsummer"},
    {display_name : "The Governor's Ball", years : [ 2021 ], name : "govball"},
    {display_name : "Ohanafest", years : [ 2021 ], name : "ohana"},
    {display_name : "Riot Fest", years : [ 2021 ], name : "riot"},
    {display_name : "Firefly", years : [ 2021 ], name : "firefly"},
    {display_name : "Pitchfork", years : [ 2021 ], name : "pitchfork"},
    {display_name : "Lollapalooza", years : [ 2021 ], name : "lollapalooza"},
    {display_name : "Austin City Limits", years : [ 2021 ], name : "acl"},
    {display_name : "Shaky Knees", years : [ 2021 ], name : "shaky"},
    {display_name : "Electric Zoo", years : [ 2021 ], name : "ezoo"},
    {display_name : "III Points", years : [ 2021 ], name : "iii"},
    {display_name : "EDC Las Vegas", years : [ 2021 ], name : "edclv"},
    {display_name : "New Orleans Jazz Fest", years : [ 2022, 2021 ], name : "jazzfest"},
    {display_name : "Lightning in a Bottle", years : [ 2022 ], name : "lib"},
    {display_name : "Day N Vegas", years : [ 2021 ], name : "daynvegas"},
    {display_name : "Audacy Beach Festival", years : [ 2021 ], name : "audacy"},
    {display_name : "Primavera Sound LA", years : [ 2022 ], name : "primaverala"},
    {display_name : "This Ain't No Picnic", years : [ 2022 ], name : "picnic"},
    {display_name : "Primavera Sound Barcelona (weekend 1)", years : [ 2022 ], name : "primaverawknd1"},
    {display_name : "Primavera Sound Barcelona (weekend 2)", years : [ 2022 ], name : "primaverawknd2"},
    {display_name : "Primavera a la Ciutat", years : [ 2022 ], name : "primaveraciutat"},
    {display_name : "CRSSD", years : [ 2022 ], name : "crssd"},
    {display_name : "Okeechobee", years : [ 2022 ], name : "okeechobee"},
    {display_name : "Forecastle", years : [ 2022 ], name : "forecastle"},
    {display_name : "Winter Wonder Grass - CA", years : [ 2022 ], name : "wwgtahoe"},
];

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    hbs.registerHelper("stringify", (object: any): string => { return JSON.stringify(object); });

    hbs.registerHelper('gt', (a, b) => { return (a > b); });

    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/", (req: express.Request, res: express.Response) => {
        // Just sort by name for now to get a constant order
        const sortedFestivals: Festival[] =
            supportedFestivals.sort((x: Festival, y: Festival) => x.name.localeCompare(y.name));

        res.render("home", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            supportedFestivals : sortedFestivals,
        });
    });

    router.get("/customize", async (req: express.Request, res: express.Response) => {
        if (!req.query.festival || !req.query.year) {
            return res.status(400).send("You need to choose a festival first.");
        }

        const queryYear: number = parseInt(req.query.year, 10);
        const festival: Festival =
            supportedFestivals.filter(x => x.name === req.query.festival && x.years.includes(queryYear))[0];

        if (!festival || !festival.name) {
            return res.status(400).send("Invalid query params");
        }

        // Now get our session data
        // TODO :: this will change for multi-festival session data support
        let                                    tracksPerArtist: number             = 0;
        let                                    topTracksCheckedStr: string         = "";
        let                                    setlistTracksCheckedStr: string     = "";
        let                                    newTracksCheckedStr: string         = "";
        let                                    previouslySelectedArtists: string[] = null;
        let                                    previouslySelectedGenres: string[]  = null;
        let                                    previouslySelectedDays: string[]    = null;
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData !== null && sessionData.festivalName === festival.name &&
            sessionData.festivalYear === queryYear) {
            // If the festival name and year matches what page we're loading, then fill in all selections / metadata
            // from session data. If the user has loaded this festival customize page before, but not saved any values,
            // we'll end up here but with none of the below options set, so we still fallback to default in here too
            tracksPerArtist = isNaN(sessionData.tracksPerArtist) ? 3 : sessionData.tracksPerArtist;

            if (sessionData.trackType === "top") {
                topTracksCheckedStr     = "checked";
                setlistTracksCheckedStr = "";
                newTracksCheckedStr     = "";
            } else if (sessionData.trackType === "setlist") {
                topTracksCheckedStr     = "";
                setlistTracksCheckedStr = "checked";
                newTracksCheckedStr     = "";
            } else if (sessionData.trackType === "recent") {
                topTracksCheckedStr     = "";
                setlistTracksCheckedStr = "";
                newTracksCheckedStr     = "checked";
            } else {
                console.error(`Resetting customize page to last known state and recieved unknown tracktype: ${
                    sessionData.trackType ? sessionData.trackType : "null or undefined"}`)
                topTracksCheckedStr     = "checked";
                setlistTracksCheckedStr = "";
                newTracksCheckedStr     = "";
            }

            previouslySelectedArtists = sessionData.artistIdsStr === undefined || sessionData.artistIdsStr === null
                                            ? null
                                            : sessionData.artistIdsStr.split(",");
            previouslySelectedGenres =
                sessionData.selectedGenresStr === undefined || sessionData.selectedGenresStr === null
                    ? null
                    : sessionData.selectedGenresStr.split(",");
            previouslySelectedDays = sessionData.selectedDaysStr === undefined || sessionData.selectedDaysStr === null
                                         ? null
                                         : sessionData.selectedDaysStr.split(",");
        } else {
            // Else save this festival info as our new session data
            const festivalName: string        = festival.name;
            const festivalDisplayName: string = festival.display_name;
            const festivalYear: number        = queryYear;

            const newSessionData: SessionData = {
                festivalName,
                festivalDisplayName,
                festivalYear,
            };

            tracksPerArtist         = 3;
            topTracksCheckedStr     = "checked";
            setlistTracksCheckedStr = "";
            newTracksCheckedStr     = "";

            // Remove old festivals metadata Save selected festival names/year
            // clang-format off
            redisClient.hdel(
                `sessionData:${req.sessionUid}`,
                "tracksPerArtist",
                "artistIdsStr",
                "trackIdsStr",
                "trackType",
                "playlistName",
                "selectedDaysStr",
                "selectedGenresStr",
                (err, obj) => {
                    if (err) {
                        console.error(err);
                    }
                }
            );

            redisClient.hmset(`sessionData:${req.sessionUid}`, newSessionData as any, redis.print);
            // clang-format on
        }

        // Get artists and work genre + session state-re-rendering magic
        const artists: SpotifyArtist[] = await redisHelper.getArtistsForFestival(redisClient, festival.name, queryYear);
        const mainGenresMap: Map<string, StatefulObject>     = new Map<string, StatefulObject>();
        const specificGenresMap: Map<string, StatefulObject> = new Map<string, StatefulObject>();
        const daysMap: Map<string, StatefulObject>           = new Map<string, StatefulObject>();
        for (const artist of artists) {
            // Perform genre combining logic
            for (const genre of artist.combined_genres) {
                if (constants.mainGenres.includes(genre)) {
                    if (!mainGenresMap.has(genre)) {
                        // If it was null, we've never set any, so check everything. Otherwise, only check those we have
                        // previously
                        const checkedStr: string =
                            previouslySelectedGenres === null || previouslySelectedGenres.includes(genre) ? "checked"
                                                                                                          : "";
                        mainGenresMap.set(genre, {state : checkedStr, obj : genre});
                    }
                } else if (!specificGenresMap.has(genre)) {
                    // If it was null, we've never set any, so check everything. Otherwise, only check those we have
                    // previously
                    const checkedStr: string =
                        previouslySelectedGenres === null || previouslySelectedGenres.includes(genre) ? "checked" : "";
                    specificGenresMap.set(genre, {state : checkedStr, obj : genre});
                }
            }

            // Cheat with artists and just shove the checked value into the artist itself. Should refactor to use
            // StatefulObject buuuuuut
            if (previouslySelectedArtists === null || previouslySelectedArtists.includes(artist.id)) {
                artist.checkedStr = "checked";
            } else {
                artist.checkedStr = "";
            }

            // Inefficient since we got a list of supported days in getArtistsForFestival but meh
            if (!daysMap.has(artist.day)) {
                const checkedStr =
                    previouslySelectedDays === null || previouslySelectedDays.includes(artist.day) ? "checked" : "";
                daysMap.set(artist.day, {state : checkedStr, obj : artist.day});
            }
        }

        const mainGenres: StatefulObject[]     = Array.from(mainGenresMap.values());
        const specificGenres: StatefulObject[] = Array.from(specificGenresMap.values());
        const days: StatefulObject[]           = Array.from(daysMap.values());
        mainGenres.sort();
        specificGenres.sort();
        days.sort();

        res.render("customize-list", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            titleOverride : `Customize Playlist - ${festival.display_name} ${queryYear}`,
            festival,
            festivalYear : queryYear,
            artists,
            mainGenres,
            specificGenres,
            days,
            tracksPerArtist,
            topTracksCheckedStr,
            setlistTracksCheckedStr,
            newTracksCheckedStr,
        });
    });

    router.get("/personalized-lineup", async (req: express.Request, res: express.Response) => {
        // make sure they didn't just navigate straight to this URL
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(400).send("This url only accessible after generating a lineup from the customize page.");
        }

        const artists: SpotifyArtist[] =
            await redisHelper.getArtistsForFestival(redisClient, sessionData.festivalName, sessionData.festivalYear);

        const chosenArtistIds = sessionData.artistIdsStr.split(",")
        const filteredArtists: SpotifyArtist[] =
            (chosenArtistIds && chosenArtistIds.length > 0) ? artists.filter(x => chosenArtistIds.includes(x.id)) : [];

        const artistsWithTracks: any = [];
        let trackIds: string[]       = [];
        for (const artist of filteredArtists) {
            let tracksForArtist: SpotifyTrack[] = [];
            if (sessionData.trackType === "recent") {
                tracksForArtist =
                    await redisHelper.getNewestTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            } else if (sessionData.trackType === "top") {
                tracksForArtist =
                    await redisHelper.getTopTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            } else if (sessionData.trackType === "setlist") {
                tracksForArtist =
                    await redisHelper.getSetlistTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            } else {
                console.warn(`Found track type of ${
                    sessionData.trackType ? sessionData.trackType
                                          : "undefined"} in session data, defaulting to top ttracks`);
                tracksForArtist =
                    await redisHelper.getTopTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            }

            const artistWithTracks = {...artist, tracks : tracksForArtist}

                                     artistsWithTracks.push(artistWithTracks);
            if (tracksForArtist && tracksForArtist.length > 0) {
                trackIds = trackIds.concat(tracksForArtist.map(x => x.id))
            }
        }

        // Update our session data with track IDs
        // clang-format off
        redisClient.hmset(`sessionData:${req.sessionUid}`, {...sessionData, trackIdsStr : trackIds.join(",")});
        // clang-format on

        res.render("personalized-lineup", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            titleOverride : `Personalized Lineup - ${sessionData.festivalDisplayName} ${sessionData.festivalYear}`,
            festivalDisplayName : sessionData.festivalDisplayName,
            acts : artistsWithTracks,
            tracksPerArtist : sessionData.tracksPerArtist,
        })
    });

    router.get("/generate-playlist-success", async (req: express.Request, res: express.Response) => {
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send("This url only accessible after generating Spotify playlist.");
        }

        const festival: Festival   = supportedFestivals.filter(x => x.name === sessionData.festivalName &&
                                                                  x.years.includes(sessionData.festivalYear))[0];
        const festivalYear: number = sessionData.festivalYear;

        res.render("generate-playlist-success", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            titleOverride : `${festival.display_name} ${festivalYear} Playlist Success`,
            festival,
            festivalYear,
            playlistName : sessionData.playlistName,
            playlistUrl : sessionData.playlistUrl,
        });
    });

    router.get("/faq", (req: express.Request, res: express.Response) => { res.render("faq"); });

    return router;
}

export default setRoutes;
