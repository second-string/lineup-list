import bodyParser from "body-parser";
import express from "express";
import handlebars from "express-handlebars";
// import https from "https";
import http from "http";

import apiRouter from "./routes/api";
import pageRouter from "./routes/pages";

const app = express();

app.engine("handlebars", handlebars());
app.set("view engine", "handlebars");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(apiRouter())
app.use(pageRouter());

const httpServer = http.createServer(app);
httpServer.listen(80);
