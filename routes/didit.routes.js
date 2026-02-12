// backend/routes/didit.js
import axios from "axios";
import express from "express";
import User from "../models/user.model.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create-verification", protect, async (req, res) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId).select(
      "email phoneNumber isVerified verificationStatus",
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(200).json({
        message: "User already verified",
        isVerified: true,
        verificationStatus: user.verificationStatus,
      });
    }

    // Call Didit API
    const response = await axios.post(
      "https://verification.didit.me/v3/session/",
      {
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: userId,
        callback: process.env.VERIFICATION_CALLBACK,
        contact_details: {
          email: user.email,
          phone: user.phoneNumber,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": process.env.DIDIT_API_KEY,
        },
      },
    );

    const sessionId = response?.data?.session_id || response?.data?.id || null;
    await User.findByIdAndUpdate(userId, {
      verificationMethod: "didit",
      verificationStatus: "pending",
      verificationSessionId: sessionId,
    });

    // Send back the hosted URL for verification
    return res.json({
      verificationUrl: response.data.url,
      sessionId,
    });
  } catch (err) {
    console.error("Didit create session error:", err.response?.data || err);
    return res.status(500).json({ error: "Verification could not be created" });
  }
});

export default router;
