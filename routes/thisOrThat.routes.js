import { Router } from "express";
import {
  getThisOrThatQuestions,
  submitThisOrThatQuestion,
} from "../controllers/thisOrThat.controller.js";
import { updateThisOrThatQuestionStatus } from "../controllers/adminThisOrThat.controller.js";
import {
  getUserThisOrThatAnswers,
  submitThisOrThatAnswer,
} from "../controllers/thisOrThatAnswer.controller.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = Router();
router.use(protect);
router.param("userId", validateObjectIdParam("userId"));

router.get("/questions", getThisOrThatQuestions);
router.get("/answers/:userId", getUserThisOrThatAnswers);
router.post("/answers", submitThisOrThatAnswer);
router.patch(
  "/questions/:questionId/status",
  requireAdmin,
  validateObjectIdParam("questionId"),
  updateThisOrThatQuestionStatus,
);
router.post(
  "/questions",
  upload.fields([
    { name: "leftImage", maxCount: 1 },
    { name: "rightImage", maxCount: 1 },
  ]),
  submitThisOrThatQuestion,
);

export default router;
