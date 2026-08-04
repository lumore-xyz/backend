import axios from "axios";
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import User from "../models/user.model.js";

const router = express.Router();

router.get("/complete", (_req, res) => {
  return res.redirect(302, "lumore://profile");
});

router.post("/create-verification", protect, async (req, res) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId).select(
      "realName dob gender isVerified verificationStatus",
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isVerified || user.verificationStatus === "approved") {
      return res.json({
        message: "User already verified",
        isVerified: true,
        verificationStatus: "approved",
      });
    }

    let dob;
    if (user.dob) {
      const dobStr = String(user.dob).slice(0, 10);
      const parts = dobStr.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (
        !Number.isNaN(y) &&
        !Number.isNaN(m) &&
        !Number.isNaN(d) &&
        m >= 1 &&
        m <= 12 &&
        d >= 1 &&
        d <= 31
      ) {
        dob = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    const gender =
      typeof user.gender === "string"
        ? user.gender.trim().toLowerCase()
        : undefined;

    const { data } = await axios.post(
      `${process.env.HALOKYC_API_URL}/api/v1/verifications/start`,
      {
        external_user_id: String(user._id),
        workflow_id: process.env.HALOKYC_WORKFLOW_ID,
        metadata: {
          name: user.realName,
          dob,
          gender,
        },
        completion_url: "https://api.lumore.xyz/api/halokyc/complete",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.HALOKYC_API_KEY,
        },
      },
    );

    if (!data?.verification_id) {
      throw new Error("HaloKYC response did not include verification_id");
    }

    const verificationUrl = new URL("/verify", process.env.HALOKYC_APP_URL);
    verificationUrl.searchParams.set("verification_id", data.verification_id);

    await User.findByIdAndUpdate(userId, {
      verificationMethod: "halokyc",
      verificationStatus: "pending",
      verificationSessionId: data.verification_id,
    });

    return res.json({
      verificationUrl: verificationUrl.toString(),
      sessionId: data.verification_id,
    });
  } catch (error) {
    console.error(
      "HaloKYC create session error:",
      error.response?.data || error,
    );
    return res.status(502).json({ error: "Verification could not be created" });
  }
});

export default router;
