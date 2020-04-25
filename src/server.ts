import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import handlebars from "express-handlebars";
// import https from "https";
import http from "http";
import redis from "redis";
import uuid from "uuid/v4";

import apiRouter from "./routes/api";
import pageRouter from "./routes/pages";

const redisClient = redis.createClient();
redisClient.on("error", (err: Error) => console.log(err));

const app = express();

app.engine("handlebars", handlebars());
app.set("view engine", "handlebars");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    let sessionUid: string = req.cookies['lineup-list-session'];
    if (sessionUid === undefined) {
        sessionUid = uuid();
        res.cookie('lineup-list-session', sessionUid);
    }

    req.sessionUid = sessionUid;
    next();
});

app.use(apiRouter(redisClient))
app.use(pageRouter(redisClient));

const httpServer = http.createServer(app);
httpServer.listen(80);
