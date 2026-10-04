import { archiveUserAccount } from "../services/accountDeletion.service.js";

export const deleteAccount = async (req, res) => {
  const userId = req.user.id;
  const result = await archiveUserAccount({ userId });

  if (!result) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({
    message: "Account archived. It will be deleted in 30 days.",
    scheduledDeletionAt: result.scheduledDeletionAt,
  });
};
