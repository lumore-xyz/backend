import { Router } from "express";
import {
  createPrompt,
  deletePrompt,
  getAllPrompts,
  getPromptCategories,
  updatePrompt,
} from "../controllers/prompt.controller.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = Router();

router.post("/", protect, requireAdmin, createPrompt);
router.get("/", getAllPrompts);
router.get("/categories", getPromptCategories);
router.put(
  "/:id",
  protect,
  requireAdmin,
  validateObjectIdParam("id"),
  updatePrompt,
);
router.delete(
  "/:id",
  protect,
  requireAdmin,
  validateObjectIdParam("id"),
  deletePrompt,
);

export default router;
