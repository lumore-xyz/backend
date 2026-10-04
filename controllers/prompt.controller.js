import {
  createPrompt as savePrompt,
  deactivatePrompt,
  listPromptCategories,
  listPrompts,
  updatePrompt as savePromptChanges,
} from "../services/prompt.service.js";

/**
 * CREATE PROMPT
 */
export const createPrompt = async (req, res) => {
  const prompt = await savePrompt(req.body);
  res.status(201).json(prompt);
};

/**
 * GET ALL PROMPTS
 * ?category=fun
 * ?category=fun,deep
 */
export const getAllPrompts = async (req, res) => {
  const prompts = await listPrompts({ category: req.query.category });
  res.json(prompts);
};

/**
 * GET PROMPTS BY CATEGORY (grouped)
 */
export const getPromptCategories = async (_req, res) => {
  const categories = await listPromptCategories();
  res.json(categories);
};

/**
 * UPDATE PROMPT
 */
export const updatePrompt = async (req, res) => {
  const prompt = await savePromptChanges(req.params.id, req.body);

  if (!prompt) {
    return res.status(404).json({ message: "Prompt not found" });
  }

  res.json(prompt);
};

/**
 * DELETE PROMPT (soft delete)
 */
export const deletePrompt = async (req, res) => {
  const prompt = await deactivatePrompt(req.params.id);

  if (!prompt) {
    return res.status(404).json({ message: "Prompt not found" });
  }

  res.json({ success: true });
};

