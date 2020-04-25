import express from "express";
import hbs from "handlebars";
import redis from "redis";
import { Router } from "express";
import { readFileSync } from 'fs';

import * as redisHelper from "../redis-helper";
import * as constants from "../constants";

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    hbs.registerHelper("stringify", (object: any): string => {
        return JSON.stringify(object);
    })

    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/festivals", (req: express.Request, res: express.Response) => {
        const supportedFestivals: Festival[] = [{ name: "Coachella", year: 2020 }, { name: "Bottlerock", year: 2020 }];
        res.render("festivals", { supportedFestivals });
    });

    router.get("/customize", async (req: express.Request, res: express.Response) => {
        if (!req.query.festival) {
            res.status(400).send("You need to choose a festival first.");
        }

        const festival: Festival =  {
            name: req.query.festival,
            year: 2020
        };

        if (!festival.name || !festival.year) {
            return res.status(400).send("Invalid query params");
        }

        const artists: SpotifyArtist[] = await redisHelper.getArtistsForFestival(redisClient, festival.name, festival.year);
        const mainGenres: string[] = [];
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
            festival,
            artists,
            mainGenres,
            specificGenres
        });
    });

    router.get("/personalized-lineup", async (req: express.Request, res: express.Response) => {
        // make sure they didn't just navigate straight to this URL
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(400).send("This url only accessible after generating a lineup from the customize page.");
        }

        const artists: SpotifyArtist[] = await redisHelper.getArtistsForFestival(redisClient, sessionData.festivalName, sessionData.festivalYear);

        const chosenArtistIds = sessionData.artistIdsStr.split(",")
        const filteredArtists: SpotifyArtist[] = (chosenArtistIds && chosenArtistIds.length > 0) ? artists.filter(x => chosenArtistIds.includes(x.id)) : [];

        const artistsWithTracks: any = []
        let trackIds: string[] = []
        for (const artist of filteredArtists) {
            const tracksForArtist = await redisHelper.getTopTracksForArtist(redisClient, artist, sessionData.tracksPerArtist);
            const artistWithTracks = {
                ...artist,
                tracks: tracksForArtist
            }

            artistsWithTracks.push(artistWithTracks);
            if (tracksForArtist && tracksForArtist.length > 0) {
                trackIds = trackIds.concat(tracksForArtist.map(x => x.id))
            }
        }

        // Update our session data with track IDs
        redisClient.hmset(`sessionData:${req.sessionUid}`, { trackIdsStr: trackIds.join(","), ...sessionData });

        res.render("personalized-lineup", {
            festivalName: "Coachella 2020",
            acts: artistsWithTracks,
            tracksPerArtist: sessionData.tracksPerArtist
        })
    });

    router.get("/generate-playlist-success", async (req: express.Request, res: express.Response) => {
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send("This url only accessible after generating Spotify playlist.");
        }

        const festival: Festival = {
            name: sessionData.festivalName,
            year: sessionData.festivalYear
        }

        res.render("generate-playlist-success", {
            festival,
            playlistName: sessionData.playlistName
        });
    });

    return router;
}

export default setRoutes;
