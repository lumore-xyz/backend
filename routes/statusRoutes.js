import express from "express";
import { appStatus } from "../controllers/statusController.js";
const router = express.Router();

router.get("/app-status", appStatus);

export default router;
