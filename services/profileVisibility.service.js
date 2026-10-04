import User from "../models/user.model.js";

export const updateUserFieldVisibility = async ({ userId, fields }) => {
  const user = await User.findById(userId, "fieldVisibility");
  if (!user) return null;

  const fieldVisibility = { ...user.fieldVisibility, ...fields };
  user.fieldVisibility = fieldVisibility;
  user.lastActive = new Date();
  await user.save();
  return fieldVisibility;
};
