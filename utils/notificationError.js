import { logError } from "./logError.js";

export const handleNotificationControllerError = (
  res,
  error,
) => {
  logError("[notifications] controller error", error);
  return res.status(500).json({
    success: false,
    message: "Server error",
  });
};
