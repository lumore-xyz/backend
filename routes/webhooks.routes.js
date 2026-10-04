import express from "express";
import { receiveHaloKycWebhook } from "../controllers/halokyc.controller.js";

const router = express.Router();

router.use("/webhooks/halokyc", express.raw({ type: "application/json" }));

router.post("/webhooks/halokyc", receiveHaloKycWebhook);

export default router;
