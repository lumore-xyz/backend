import { Router } from "express";
import {
  createPrompt,
  deletePrompt,
  getAllPrompts,
  getPromptCategories,
  updatePrompt,
} from "../controllers/prompt.controller.js";

const router = Router();

router.post("/", createPrompt); // admin
router.get("/", getAllPrompts);
router.get("/categories", getPromptCategories);
router.put("/:id", updatePrompt); // admin
router.delete("/:id", deletePrompt); // admin

export default router;
