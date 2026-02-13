import { Router } from "express";
import {
  getThisOrThatQuestions,
  getUserThisOrThatAnswers,
  submitThisOrThatAnswer,
  submitThisOrThatQuestion,
} from "../controllers/thisOrThat.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = Router();

router.get("/questions", protect, getThisOrThatQuestions);
router.get(
  "/answers/:userId",
  protect,
  validateObjectIdParam("userId"),
  getUserThisOrThatAnswers,
);
router.post("/answers", protect, submitThisOrThatAnswer);
router.post(
  "/questions",
  protect,
  upload.fields([
    { name: "leftImage", maxCount: 1 },
    { name: "rightImage", maxCount: 1 },
  ]),
  submitThisOrThatQuestion,
);

export default router;
