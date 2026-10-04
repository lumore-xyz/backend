import { authenticateAdminGoogleUser } from "../services/auth.service.js";
import { getGooglePayloadFromCode } from "../services/googleAuth.service.js";
import { logError } from "../utils/logError.js";

export const adminGoogleLoginWeb = async (req, res) => {
  const code = req.body?.code;

  try {
    if (!code) {
      return res.status(400).json({ message: "Google auth code is required" });
    }

    const payload = await getGooglePayloadFromCode(code);
    const result = await authenticateAdminGoogleUser(payload);
    if (result.error === "EMAIL_NOT_VERIFIED") {
      return res.status(400).json({ message: "Email not verified by Google" });
    }
    if (result.error === "ADMIN_ACCESS_DENIED") {
      return res.status(403).json({
        message: "Admin access denied",
      });
    }

    return res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    logError("[admin-auth] Google login failed", error);
    return res.status(500).json({ message: "Google login failed" });
  }
};
