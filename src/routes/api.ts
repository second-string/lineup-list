import express from "express";
import { Router } from "express";

function setRoutes(): express.Router {
    const router = Router();

    router.post("/generate", async (req: express.Request, res: express.Response) => {

        res.redirect("/success");
    });

    return router;
}

export default setRoutes;
