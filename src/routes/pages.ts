import express from "express";
import {Router} from "express";
import {readFileSync} from 'fs';
import hbs from "handlebars";
import redis from "redis";

import * as constants   from "../constants";
import * as redisHelper from "../redis-helper";

const supportedFestivals: Festival[] = [
    {display_name : "Coachella", year : 2020, name : "coachella"},
    {display_name : "Bottlerock", year : 2020, name : "bottlerock"},
    {display_name : "Outside Lands", year : 2021, name : "osl"},
];

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    hbs.registerHelper("stringify", (object: any): string => {
        return JSON.stringify(object);
    })

    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/", (req: express.Request, res: express.Response) => {
        const sortedFestivals: Festival[] = supportedFestivals.sort((x: Festival, y: Festival) => {
            if (x.year > y.year) {
                return -1;
            } else if (x.year < y.year) {
                return 1;
            } else {
                return 0;
            }
        });

        res.render("home", {supportedFestivals : sortedFestivals});
    });

    router.get("/customize", async (req: express.Request, res: express.Response) => {
        if (!req.query.festival) {
            res.status(400).send("You need to choose a festival first.");
        }

        // TODO :: Figure out how to pass fest and year as separate query params. Need two selects changing dynamically
        // based on festival selected for supported year arrays our hack for now is to concat the two with an underscore
        const festivalParts: string = req.query.festival.split('_');
        const festival: Festival =
            supportedFestivals.filter(x => x.name === festivalParts[0] && x.year === parseInt(festivalParts[1], 10))[0];

        if (!festival.name || !festival.year) {
            return res.status(400).send("Invalid query params");
        }

        const artists: SpotifyArtist[] =
            await redisHelper.getArtistsForFestival(redisClient, festival.name, festival.year);
        const mainGenres: string[]     = [];
        const specificGenres: string[] = [];
        for (const artist of artists) {
            for (const genre of artist.combined_genres) {
                if (constants.mainGenres.includes(genre)) {
                    if (!mainGenres.includes(genre)) {
                        mainGenres.push(genre);
                    }
                } else if (!specificGenres.includes(genre)) {
                    specificGenres.push(genre);
                }
            }
        }

        mainGenres.sort();
        specificGenres.sort();

        res.render("customize-list", {festival, artists, mainGenres, specificGenres});
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
            const tracksForArtist =
                await redisHelper.getTopTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            const artistWithTracks = {...artist, tracks : tracksForArtist}

                                     artistsWithTracks.push(artistWithTracks);
            if (tracksForArtist && tracksForArtist.length > 0) {
                trackIds = trackIds.concat(tracksForArtist.map(x => x.id))
            }
        }

        // Update our session data with track IDs
        redisClient.hmset(`sessionData:${req.sessionUid}`, {...sessionData, trackIdsStr : trackIds.join(",")});

        res.render("personalized-lineup", {
            festivalDisplayName : sessionData.festivalDisplayName,
            acts : artistsWithTracks,
            tracksPerArtist : sessionData.tracksPerArtist
        })
    });

    router.get("/generate-playlist-success", async (req: express.Request, res: express.Response) => {
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send("This url only accessible after generating Spotify playlist.");
        }

        const festival: Festival = supportedFestivals.filter(x => x.name === sessionData.festivalName &&
                                                                  x.year === sessionData.festivalYear)[0];

        res.render("generate-playlist-success", {festival, playlistName : sessionData.playlistName});
    });

    return router;
}

export default setRoutes;
