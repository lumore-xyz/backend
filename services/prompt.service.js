import { Prompt } from "../models/prompt.model.js";

export const createPrompt = (input) => Prompt.create(input);

export const listPrompts = ({ category } = {}) => {
  const filter = { isActive: true };
  if (category) filter.category = { $in: category.split(",") };

  return Prompt.find(filter).sort({ createdAt: -1 });
};

export const listPromptCategories = () =>
  Prompt.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

export const updatePrompt = (id, input) =>
  Prompt.findByIdAndUpdate(id, input, { returnDocument: "after" });

export const deactivatePrompt = (id) =>
  Prompt.findByIdAndUpdate(id, { isActive: false }, { returnDocument: "after" });
