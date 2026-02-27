import { Prompt } from "../models/prompt.model.js";

/**
 * CREATE PROMPT
 */
export const createPrompt = async (req, res) => {
  const prompt = await Prompt.create(req.body);
  res.status(201).json(prompt);
};

/**
 * GET ALL PROMPTS
 * ?category=fun
 * ?category=fun,deep
 */
export const getAllPrompts = async (req, res) => {
  const { category } = req.query;

  const filter = { isActive: true };

  if (category) {
    filter.category = {
      $in: category.split(","),
    };
  }

  const prompts = await Prompt.find(filter).sort({ createdAt: -1 });

  res.json(prompts);
};

/**
 * GET PROMPTS BY CATEGORY (grouped)
 */
export const getPromptCategories = async (_req, res) => {
  const categories = await Prompt.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json(categories);
};

/**
 * UPDATE PROMPT
 */
export const updatePrompt = async (req, res) => {
  const prompt = await Prompt.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: "after",
  });

  if (!prompt) {
    return res.status(404).json({ message: "Prompt not found" });
  }

  res.json(prompt);
};

/**
 * DELETE PROMPT (soft delete)
 */
export const deletePrompt = async (req, res) => {
  const prompt = await Prompt.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { returnDocument: "after" }
  );

  if (!prompt) {
    return res.status(404).json({ message: "Prompt not found" });
  }

  res.json({ success: true });
};

