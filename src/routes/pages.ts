import express from "express";
import {Router} from "express";
import {readFileSync} from 'fs';
import hbs from "handlebars";
import redis from "redis";

import * as constants   from "../constants";
import * as redisHelper from "../redis-helper";

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    hbs.registerHelper("stringify", (object: any): string => { return JSON.stringify(object); });

    hbs.registerHelper('gt', (a, b) => { return (a > b); });

    hbs.registerHelper("disableoptionifregion",
                       (object: Festival): string => { return object.name.length < 1 ? "disabled" : ""; });

    hbs.registerHelper('formatDate', (date: Date) => new hbs.SafeString(date.toDateString()));

    hbs.registerHelper(
        "isNullUndefinedOrEmpty",
        (object: string): boolean => { return object === null || object === undefined || object.length === 0; });

    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/", (req: express.Request, res: express.Response) => {
        const sortedFestivals: Festival[] = [...constants.supportedFestivals ];

        const regionCodes = [...new Set(constants.supportedFestivals.map(festival => festival.region)) ];

        // add regions to the dropdown as disabled values to provide section breaks
        for (const region of constants.regions) {
            if (regionCodes.includes(region.name))
                sortedFestivals.push({display_name : region.display_name, years : [], name : "", region : region.name});
        }

        sortedFestivals.sort((x: Festival, y: Festival) => {
            const xIsRegion = x.name === "" && x.years.length === 0;
            const yIsRegion = y.name === "" && y.years.length === 0;

            // If both regions, sort normally on region display name. If X XOR Y is a region, either sort on region code
            // or if both the same region code, make region entry first. If neither are region, sort primarily on region
            // and secondarily on display name if region the same.
            if (xIsRegion && yIsRegion) {
                return x.display_name.localeCompare(y.display_name);
            } else if (xIsRegion) {
                return x.region.localeCompare(y.region) || -1;
            } else if (yIsRegion) {
                return x.region.localeCompare(y.region) || 1;
            } else {
                return x.region.localeCompare(y.region) || x.display_name.localeCompare(y.display_name);
            }
        });

        res.render("home", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            supportedFestivals : sortedFestivals,
        });
    });

    router.get("/customize", async (req: express.Request, res: express.Response) => {
        if (!req.query.festival || !req.query.year) {
            return res.status(400).send("You need to choose a festival first.");
        }

        const queryYear: number = parseInt(req.query.year as string, 10);
        const festival: Festival =
            constants.supportedFestivals.filter(x => x.name === req.query.festival && x.years.includes(queryYear))[0];

        if (!festival || !festival.name) {
            return res.status(400).send("Invalid query params");
        }

        // Now get our session data
        // TODO :: this will change for multi-festival session data support
        let   tracksPerArtist: number             = 0;
        let   topTracksCheckedStr: string         = "";
        let   setlistTracksCheckedStr: string     = "";
        let   newTracksCheckedStr: string         = "";
        let   previouslySelectedArtists: string[] = null;
        let   previouslySelectedGenres: string[]  = null;
        let   previouslySelectedDays: string[]    = null;
        const sessionData: SessionData            = await redisHelper.getSessionData(redisClient, req.sessionUid);
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
        const                                  dayMetadataList: FestivalDayMetadata[] =
            await redisHelper.getFestivalDayMetadata(redisClient, festival.name, queryYear);
        const     usingDayMetadata: boolean =
            dayMetadataList !== null && dayMetadataList !== undefined && dayMetadataList.length > 0;

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

            // If no festival day metadata exists, this lineup was saved in redis before the yaml format and extraction
            // was added. Just use old logic where the list of days is built by looking at every artists' day and
            // de-duping. Still use FestivalDayMetadata object as obj so frontend can always know it's getting that obj,
            // just fill in the day number field
            if (!usingDayMetadata && !daysMap.has(artist.day)) {
                const newDayMetadata: FestivalDayMetadata = {
                    number : Number(artist.day),
                    date : null,
                    display_name : null,
                };
                const checkedStr =
                    previouslySelectedDays === null || previouslySelectedDays.includes(artist.day) ? "checked" : "";
                daysMap.set(artist.day, {state : checkedStr, obj : newDayMetadata});
            }
        }

        // If day metadata was found in redis, build the 'metadata obj by day number' dict quickly here. daysMap always
        // is the same time, but if metadata not available for this festival than it's just all null except for the
        // number and is built in the loop above.
        if (usingDayMetadata) {
            console.log("Found day metadata for festival, building days with that (not artists day string)");
            for (const dayMetadata of dayMetadataList) {
                const dayNumberStr: string = dayMetadata.number.toString(10);
                const checkedStr =
                    previouslySelectedDays === null || previouslySelectedDays.includes(dayNumberStr) ? "checked" : "";
                daysMap.set(dayNumberStr, {state : checkedStr, obj : dayMetadata});
            }
        }

        const mainGenres: StatefulObject[]     = Array.from(mainGenresMap.values());
        const specificGenres: StatefulObject[] = Array.from(specificGenresMap.values());
        const days: StatefulObject[]           = Array.from(daysMap.values());
        mainGenres.sort();
        specificGenres.sort();
        days.sort((a, b) => Number(a.obj.number) - Number(b.obj.number));  // Orders by returning pos, 0, or neg

        const lastUpdatedDate = await redisHelper.getLineupLastUpdatedDate(redisClient, festival.name, queryYear);

        res.render("customize-list", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            titleOverride : `Customize Playlist - ${festival.display_name} ${queryYear}`,
            festival,
            festivalYear : queryYear,
            lastUpdatedDate,
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

        const     artists: SpotifyArtist[] =
            await redisHelper.getArtistsForFestival(redisClient, sessionData.festivalName, sessionData.festivalYear);

        const chosenArtistIds = sessionData.artistIdsStr.split(",")
        const filteredArtists: SpotifyArtist[] =
            (chosenArtistIds && chosenArtistIds.length > 0) ? artists.filter(x => chosenArtistIds.includes(x.id)) : [];

        const artistsWithTracks: any = [];
        let   trackIds: string[]     = [];
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
            playlistName : `${sessionData.festivalDisplayName} ${sessionData.festivalYear} - Lineup List`,
            acts : artistsWithTracks,
            tracksPerArtist : sessionData.tracksPerArtist,
        })
    });

    router.get("/generate-playlist-success", async (req: express.Request, res: express.Response) => {
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send("This url only accessible after generating Spotify playlist.");
        }

        const festival: Festival = constants.supportedFestivals.filter(
            x => x.name === sessionData.festivalName && x.years.includes(sessionData.festivalYear))[0];
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
