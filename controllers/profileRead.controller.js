import { getProfileData } from "../services/profileRead.service.js";

export const getProfile = async (req, res) => {
  try {
    const data = await getProfileData({
      userId: req.params.userId,
      viewerId: req.user?.id,
    });
    return res.status(200).json(data);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    throw error;
  }
};
