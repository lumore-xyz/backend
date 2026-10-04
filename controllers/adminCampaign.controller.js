import {
  getAdminCampaignConfigData,
  sendAdminCampaignMessage,
} from "../services/adminCampaign.service.js";

export const getAdminCampaignConfig = async (_req, res) => {
  return res.status(200).json({
    success: true,
    data: await getAdminCampaignConfigData(),
  });
};

export const sendAdminCampaign = async (req, res) => {
  const result = await sendAdminCampaignMessage({
    input: req.body,
    actorId: req.user?._id,
  });
  return res.status(result.statusCode).json(result.payload);
};
