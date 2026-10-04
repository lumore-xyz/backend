import { getAppStatusData } from "../services/appStatus.service.js";

export const appStatus = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: await getAppStatusData(),
  });
};
