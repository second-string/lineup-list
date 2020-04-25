import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import handlebars from "express-handlebars";
import https from "https";
// import http from "http";
import redis from "redis";
import uuid from "uuid/v4";
import fs from "fs";

import apiRouter from "./routes/api";
import pageRouter from "./routes/pages";

const redisClient = redis.createClient();
redisClient.on("error", (err: Error) => console.log(err));

const app = express();
if (!process.env.DEPLOY_STAGE || process.env.DEPLOY_STAGE === '') {
    console.log("Need to source setup_env.sh to set env variables");
    process.exit(1);
}
const port = process.env.DEPLOY_STAGE === 'PROD' ? 7443 : 443;

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

// HTTPS certs
let creds = {};
if (process.env.DEPLOY_STAGE === "PROD") {
    if (!process.env.PROD_SSL_KEY_PATH || !process.env.PROD_SSL_CERT_PATH || !process.env.PROD_SSL_CA_CERT_PATH) {
        console.log("SSL cert env variables not set. Source the setup_env.sh script");
        process.exit(1);
    }

    const key = fs.readFileSync(process.env.PROD_SSL_KEY_PATH);
    const cert = fs.readFileSync(process.env.PROD_SSL_CERT_PATH);
    const ca = fs.readFileSync(process.env.PROD_SSL_CA_CERT_PATH);
    creds = {
        key,
        cert,
        ca
    };
} else {
    console.log("Running server locally using local self-signed cert");
    const localKey = fs.readFileSync(__dirname + "/../lineuplist-selfsigned-key.pem", "utf-8");
    const localCert = fs.readFileSync(__dirname + "/../lineuplist-selfsigned-cert.pem", "utf-8");
    creds = {
        key: localKey,
        cert: localCert
    };
}

const httpsServer = https.createServer(creds, app);
console.log(`Starting server listening at ${port}`);
httpsServer.listen(port);
