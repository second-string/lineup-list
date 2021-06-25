import express from "express";
import {Router} from "express";
import querystring from "querystring";
import redis from "redis";
import uuid from "uuid/v4";

import * as constants     from "../constants";
import * as helpers       from "../helpers";
import * as redisHelper   from "../redis-helper";
import * as spotifyHelper from "../spotify-helper";

function setRoutes(redisClient: redis.RedisClient): express.Router {
    const router = Router();

    router.post("/generate-lineup-list", async (req: express.Request, res: express.Response) => {
        const festivalName: string        = req.body.festivalName;
        const festivalDisplayName: string = req.body.festivalDisplayName;
        const festivalYear: number        = parseInt(req.body.festivalYear, 10);
        const tracksPerArtist: number     = parseInt(req.body.tracksPerArtist, 10);
        const artistIdsStr: string        = req.body.artistIds ? req.body.artistIds : "";
        const trackType: string           = req.body.trackType;
        const selectedDaysStr: string     = req.body.selectedDays ? req.body.selectedDays : "";
        const selectedGenresStr: string   = req.body.selectedGenres ? req.body.selectedGenres : "";

        if (tracksPerArtist < 1 || tracksPerArtist > 10) {
            return res.status(400).send("Number of tracks per artist must be between 1 and 10");
        }

        const sessionData: SessionData = {
            festivalName,
            festivalDisplayName,
            festivalYear,
            tracksPerArtist,
            artistIdsStr,
            trackType,
            selectedDaysStr,
            selectedGenresStr,
        };

        // Save our session data for what artists and how many tracks to include
        redisClient.hmset(`sessionData:${req.sessionUid}`, sessionData as any, (err, obj) => {
            if (err) {
                console.error(err);
            }
        });
        res.redirect("/personalized-lineup");
    });

    router.post("/generate-spotify-playlist", async (req: express.Request, res: express.Response) => {
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send("This url only accessible after generating a lineup from the customize page.");
        }

        const redirectBaseUri = process.env.DEPLOY_STAGE === "PROD" ? "lineuplist.live" : "localhost";
        const queryParams     = {
            client_id : constants.clientId,
            response_type : "code",
            redirect_uri : `https://${redirectBaseUri}/spotify-auth-callback`,
            state : "kush",
            scope : "playlist-read-collaborative playlist-read-private playlist-modify-private playlist-modify-public"
        };

        res.redirect(`https://accounts.spotify.com/authorize?${querystring.encode(queryParams)}`);
    });

    router.get("/spotify-auth-callback", async (req: express.Request, res: express.Response) => {
        // Check we came from spotify auth callback with a previously-set state
        if (req.query.state !== "kush") {
            return res.status(403).send("This url only accessible after authorizing with Spotify");
        }

        // make sure they didn't just navigate straight to this URL
        const sessionData: SessionData = await redisHelper.getSessionData(redisClient, req.sessionUid);
        if (sessionData === null) {
            return res.status(403).send(
                "This url only accessible after authorizing with Spotify, please restart playlist generation.");
        }

        const {access, refresh, ...accessTokenResponse} =
            await spotifyHelper.getAccessTokenFromCallback(req.query.code, req.query.error);
        if (accessTokenResponse.error) {
            return res.status(500).send(accessTokenResponse.error);
        }

        const {user, ...getUserFromTokenResponse} = await spotifyHelper.getSpotifyUserFromToken(access);
        if (getUserFromTokenResponse.error) {
            return res.status(500).send(getUserFromTokenResponse.error);
        }

        const playlistName: string = `${sessionData.festivalDisplayName} ${sessionData.festivalYear} - Lineup List`;
        const playlist: any = await spotifyHelper.getOrCreatePlaylist(access, user.id, playlistName);

        // Saw an instance of trackIds being undefined on the server, not sure if all sessiondata was missing or just
        // tracks somehow
        if (sessionData.trackIdsStr == undefined) {
            return res.status(500).send(
                "Server state is wonky. Try returning to the customize or personlized lineup screen and try again. Sorry!");
        }
        const trackUris: string[] = sessionData.trackIdsStr.split(',').map(x => `spotify:track:${x}`);

        const success: boolean = await spotifyHelper.addTracksToPlaylist(access, playlist, trackUris);
        if (!success) {
            console.log(`Error adding ${trackUris.length} tracks to playlist ${playlistName}`);
            return res.status(500).send("Server error, please try again.");
        }

        const playlistUrl: string = playlist.external_urls.spotify;

        redisClient.hmset(`sessionData:${req.sessionUid}`, {...sessionData, playlistName, playlistUrl});
        res.redirect("/generate-playlist-success");
    });

    return router;
}

export default setRoutes;
