import express from "express";
import { appStatus } from "../controllers/status.controller.js";
const router = express.Router();

router.get("/app-status", appStatus);

export default router;
