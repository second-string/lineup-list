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
        const songsPerArtist: number = req.cookies.songsPerArtist;
        const excludedArtistIds: string[] = req.cookies.excludedArtists;
        const festival: Festival = {
            name: req.cookies.festivalName,
            year: req.cookies.festivalYear
        };

        res.clearCookie("songsPerArtist");
        res.clearCookie("excludedArtists");
        res.clearCookie("festivalName");
        res.clearCookie("festivalYear");

        if (!songsPerArtist) {
            return res.send("You must generate a lineup from the customize page.");
        }

        const artists: SpotifyArtist[] = await redisHelper.getArtistsForFestival(redisClient, festival.name, festival.year);
        const filteredArtists: SpotifyArtist[] = (excludedArtistIds && excludedArtistIds.length > 0) ? artists.filter(x => !excludedArtistIds.includes(x.id)) : artists;

        const artistsWithTracks: any = []
        for (const artist of filteredArtists) {
            const tracksForArtist = await redisHelper.getTopTracksForArtist(redisClient, artist, songsPerArtist);
            const artistWithTracks = {
                ...artist,
                tracks: tracksForArtist
            }
            artistsWithTracks.push(artistWithTracks);
        }

        res.render("personalized-lineup", {
            festivalName: "Coachella 2020",
            acts: artistsWithTracks,
            tracksPerArtist: songsPerArtist
        })
    });

    router.get("/generate-playlist-success", (req: express.Request, res: express.Response) => {
        res.render("generate-playlist-success", {
            festival: { name: "festival", year: 9999 },
            playlistName: "playlist name"
        });
    });

    return router;
}

export default setRoutes;
