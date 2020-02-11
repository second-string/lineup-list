import { Router } from "express";
import express from "express";
import { readFileSync } from 'fs';

import * as spotifyHelper from "../spotify-helper";

function setRoutes(): express.Router {
    const router = Router();

    router.get("/options", (req: express.Request, res: express.Response) => res.render("list-options", { festivalName: "Coachella 2020" }));
    router.get("/success", (req: express.Request, res: express.Response) => res.render("generate-success", { festivalName: "Coachella 2020" }));
    router.get("/health", (req: express.Request, res: express.Response) => res.send("healthy"));

    router.get("/personalized-lineup", async (req: express.Request, res: express.Response) => {
        const songsPerArtist: number = req.query.songsPerArtist;
        const spotifyToken: string = await spotifyHelper.getSpotifyToken();
        const file = readFileSync("Coachella_2020.txt", "utf-8");
        const artistNames = file.split('\n');
        const artists: SpotifyArtist[] = await spotifyHelper.getSpotifyArtists(spotifyToken, artistNames);
        const tracks: SpotifyTrack[] = await spotifyHelper.getAllTracksToAdd(spotifyToken, artists);
        const artistsWithTracks: any = []
        for (const artist of artists) {
            const artistWithTracks = {
                ...artist,
                tracks: tracks.filter(x => x.artists[0].id === artist.id)
            }
            artistsWithTracks.push(artistWithTracks);
        }

        res.render("personalized-lineup", {
            festivalName: "Coachella 2020",
            acts: artistsWithTracks
        })
    });

    return router;
}

export default setRoutes;
