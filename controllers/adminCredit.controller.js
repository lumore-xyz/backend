import { getCreditLedgerPage } from "../services/adminCredit.service.js";
import { getCreditLedgerAnalyticsData } from "../services/adminCreditAnalytics.service.js";
import { logError } from "../utils/logError.js";

export const getCreditLedgerAdmin = async (req, res) => {
  const result = await getCreditLedgerPage(req.query);
  return res.status(200).json({ success: true, ...result });
};

export const getCreditLedgerAnalyticsAdmin = async (req, res) => {
  try {
    const data = await getCreditLedgerAnalyticsData(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    logError("[admin] credit_analytics_failed", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
