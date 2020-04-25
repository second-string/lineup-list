import express from "express";
import { Router } from "express";
import querystring from "querystring";
import redis from "redis";
import uuid from "uuid/v4";

import * as helpers from "../helpers";
import * as spotifyHelper from "../spotify-helper";
import * as redisHelper from "../redis-helper";
import * as constants from "../constants";

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    router.post("/generate-lineup-list", async (req: express.Request, res: express.Response) => {
        // Hacky to set a cookie and then clear it before it gets back to the user but it works
        res.cookie("songsPerArtist", req.body.songsPerArtist);
        res.cookie("excludedArtists", req.body.excludedArtists);
        res.cookie("festivalName", req.body.festivalName);
        res.cookie("festivalYear", req.body.festivalYear);
        res.redirect("/personalized-lineup");
    });

    router.post("/generate-spotify-playlist", async (req: express.Request, res: express.Response) => {
        const festivalName: string = req.body.festivalName;
        const tracksPerArtist: string = req.body.tracksPerArtist;
        const artistIdsStr: string = req.body.artistIds;
        const trackIdsStr: string = req.body.trackIds;

        if (!festivalName || !tracksPerArtist || !artistIdsStr || !trackIdsStr) {
            return res.status(403).send("You must choose to generate a playlist from the customized lineup page.");
        }

        const sessionUid = uuid();
        const sessionData = {
            festivalName,
            tracksPerArtist,
            artistIdsStr,
            trackIdsStr
        };

        redisClient.hmset(`playlistData:${sessionUid}`, sessionData, redis.print);
        res.cookie("lineup-list-session", sessionUid);

        const queryParams = {
            client_id: constants.clientId,
            response_type: "code",
            redirect_uri: "http://localhost/spotify-auth-callback",
            state: "kush",
            scope: "playlist-read-collaborative playlist-read-private playlist-modify-private playlist-modify-public"
        };

        res.redirect(`https://accounts.spotify.com/authorize?${querystring.encode(queryParams)}`);
    });

    router.get("/spotify-auth-callback", async (req: express.Request, res: express.Response) => {
        // Check we came from spotify auth callback with a previously-set session uid for retrieving data
        if (req.query.state !== "kush" || req.sessionUid) {
            return res.status(403).send("This url only accessible after authorizing with Spotify");
        }

        const playlistData: PlaylistData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (playlistData === null) {
            return res.status(400).send("This url only accessible after authorizing with Spotify, please restart playlist generation.");
        }

        const { access, refresh, ...accessTokenResponse } = await spotifyHelper.getAccessTokenFromCallback(req.query.code, req.query.error);
        if (accessTokenResponse.error) {
            res.status(500).send(accessTokenResponse.error);
        }

        const { user, ...getUserFromTokenResponse } = await spotifyHelper.getSpotifyUserFromToken(access);
        if (getUserFromTokenResponse.error) {
            res.status(500).send(getUserFromTokenResponse.error);
        }

        const playlistName: string = `${playlistData.festivalName} - Lineup List`;
        const playlist: any = await spotifyHelper.getOrCreatePlaylist(access, user.id, playlistName);

        const trackUris: string[] = playlistData.trackIdsStr.split(',')
            .map(x => `spotify:track:${x}`);

        const success: boolean = await spotifyHelper.addTracksToPlaylist(access, playlist, trackUris);
        if (!success) {
            console.log(`Error adding ${trackUris.length} tracks to playlist ${playlistName}`);
            return res.status(500).send("Server error, please try again.");
        }

        res.clearCookie("lineup-list-session");
        redisClient.DEL(`playlistData:${req.sessionUid}`);

        res.redirect("/generate-playlist-success");
    });

    return router;
}

export default setRoutes;
