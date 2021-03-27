import express from "express";
import {Router} from "express";
import {readFileSync} from 'fs';
import hbs from "handlebars";
import redis from "redis";

import * as constants   from "../constants";
import * as redisHelper from "../redis-helper";

const supportedFestivals: Festival[] = [
    {display_name : "Coachella", years : [ 2020 ], name : "coachella"},
    {display_name : "Bottlerock", years : [ 2020 ], name : "bottlerock"},
    {display_name : "Outside Lands", years : [ 2021, 2019 ], name : "osl"},
];

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    hbs.registerHelper("stringify", (object: any): string => {
        return JSON.stringify(object);
    })

    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/", (req: express.Request, res: express.Response) => {
        const sortedFestivals: Festival[] = supportedFestivals.sort((x: Festival, y: Festival) => {
            // todo : sort on something here with year lists
            return 0;
            // if (x.year > y.year) {
            //    return -1;
            // } else if (x.year < y.year) {
            //    return 1;
            // } else {
            //    return 0;
            // }
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

        const queryYear: number = parseInt(req.query.year, 10);
        const festival: Festival =
            supportedFestivals.filter(x => x.name === req.query.festival && x.years.includes(queryYear))[0];

        if (!festival || !festival.name) {
            return res.status(400).send("Invalid query params");
        }

        const festivalName: string        = festival.name;
        const festivalDisplayName: string = festival.display_name;
        const festivalYear: number        = queryYear;

        const sessionData: SessionData = {
            festivalName,
            festivalDisplayName,
            festivalYear,
        };

        // Save our session data for selected festival year
        redisClient.hmset(`sessionData:${req.sessionUid}`, sessionData as any, redis.print);

        const artists: SpotifyArtist[] = await redisHelper.getArtistsForFestival(redisClient, festival.name, queryYear);
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

        res.render("customize-list", {
            prod : process.env.DEPLOY_STAGE === 'PROD',
            festival,
            festivalYear,
            artists,
            mainGenres,
            specificGenres,
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
            prod : process.env.DEPLOY_STAGE === 'PROD',
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
            festival,
            festivalYear,
            playlistName : sessionData.playlistName,
        });
    });

    return router;
}

export default setRoutes;
