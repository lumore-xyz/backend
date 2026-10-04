import { getAdminStatsData } from "../services/adminStats.service.js";

export const getAdminStats = async (req, res) => {
  const data = await getAdminStatsData({
    locationMode: req.query?.locationMode,
    country: req.query?.country,
    locationLimit: req.query?.locationLimit,
  });
  return res.status(200).json(data);
};
