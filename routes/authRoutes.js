const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const User = require("../models/User"); // ensure correct path
const OtpSession = require("../models/OtpSession");
const {
  loginUser,
  generateToken,
  ensureUserRole,
} = require("../controllers/authController");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const DEFAULT_FAST2SMS_ROUTE = "dlt_manual";
const DEFAULT_FAST2SMS_SENDER_ID = "GEPSMS";
const DEFAULT_FAST2SMS_ENTITY_ID = "1201177428135766247";
const DEFAULT_FAST2SMS_TEMPLATE_ID = "1207177522097367395";
const DEFAULT_FAST2SMS_OTP_TEMPLATE =
  "{otp} is your OTP for carbiQr login. Do not share it with anyone. Regards - Grantham Enterprises";
const DEFAULT_REVIEWER_MOBILE = "1111111168";
const DEFAULT_REVIEWER_OTP = "111111";

function normalizeMobile(mobile) {
  return String(mobile || "").trim();
}

function isValidMobile(mobile) {
  return MOBILE_REGEX.test(normalizeMobile(mobile));
}

function getReviewerMobile() {
  return normalizeMobile(process.env.REVIEWER_MOBILE) || DEFAULT_REVIEWER_MOBILE;
}

function getReviewerOtp() {
  return String(process.env.REVIEWER_OTP || DEFAULT_REVIEWER_OTP).trim();
}

function isReviewerMobile(mobile) {
  return normalizeMobile(mobile) === getReviewerMobile();
}

function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

async function sendOtpSms(mobile, otp) {
  if (!process.env.FAST2SMS_API_KEY) {
    throw new Error("FAST2SMS API key is not configured.");
  }

  const route = process.env.FAST2SMS_ROUTE || DEFAULT_FAST2SMS_ROUTE;
  const senderId =
    process.env.FAST2SMS_SENDER_ID || DEFAULT_FAST2SMS_SENDER_ID;
  const entityId =
    process.env.FAST2SMS_ENTITY_ID || DEFAULT_FAST2SMS_ENTITY_ID;
  const templateId =
    process.env.FAST2SMS_TEMPLATE_ID || DEFAULT_FAST2SMS_TEMPLATE_ID;
  const otpTemplate =
    process.env.FAST2SMS_OTP_MESSAGE || DEFAULT_FAST2SMS_OTP_TEMPLATE;
  const message = otpTemplate.replace("{otp}", otp);

  const payload = new URLSearchParams({
    route,
    sender_id: senderId,
    template_id: templateId,
    entity_id: entityId,
    message,
    numbers: mobile,
    flash: "0",
  });

  await axios.post("https://www.fast2sms.com/dev/bulkV2", payload.toString(), {
    headers: {
      authorization: process.env.FAST2SMS_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

router.post("/login", loginUser);

async function handleSendOtp(req, res) {
  try {
    const mobile = normalizeMobile(req.body?.mobile);

    if (!isValidMobile(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    const now = new Date();
    const existingSession = await OtpSession.findOne({ mobile });
    const isReviewer = isReviewerMobile(mobile);

    if (
      existingSession?.lastSentAt &&
      now.getTime() - existingSession.lastSentAt.getTime() <
        OTP_RESEND_COOLDOWN_MS
    ) {
      const retryAfterSeconds = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS -
          (now.getTime() - existingSession.lastSentAt.getTime())) /
          1000
      );

      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds}s before requesting OTP again.`,
      });
    }

    const otp = isReviewer ? getReviewerOtp() : generateOtp();

    if (!isReviewer) {
      await sendOtpSms(mobile, otp);
    }

    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    if (existingSession) {
      existingSession.otpHash = hashOtp(otp);
      existingSession.expiresAt = expiresAt;
      existingSession.attempts = 0;
      existingSession.resendCount = (existingSession.resendCount || 0) + 1;
      existingSession.lastSentAt = now;
      await existingSession.save();
    } else {
      await OtpSession.create({
        mobile,
        otpHash: hashOtp(otp),
        expiresAt,
        attempts: 0,
        resendCount: 1,
        lastSentAt: now,
      });
    }

    res.json({
      success: true,
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      reviewerMode: isReviewer,
    });
  } catch (error) {
    console.log("OTP send error:", error.response?.data || error.message);
    res.status(500).json({
      message:
        error.message === "FAST2SMS API key is not configured."
          ? error.message
          : "OTP send failed",
    });
  }
}

// ================= SEND OTP =================
router.post("/send-otp", handleSendOtp);

router.post("/resend-otp", handleSendOtp);

// ================= VERIFY OTP =================
router.post("/verify-otp", async (req, res) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const otp = String(req.body?.otp || "").trim();

    if (!isValidMobile(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    if (!otp || otp.length !== OTP_LENGTH) {
      return res.status(400).json({ message: "Valid OTP required" });
    }

    const otpSession = await OtpSession.findOne({ mobile });

    if (!otpSession) {
      return res.status(400).json({ message: "OTP not found. Please request again." });
    }

    if (otpSession.expiresAt.getTime() < Date.now()) {
      await otpSession.deleteOne();
      return res.status(400).json({ message: "OTP expired. Please request again." });
    }

    if ((otpSession.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await otpSession.deleteOne();
      return res.status(429).json({
        message: "Too many invalid attempts. Please request a new OTP.",
      });
    }

    const enteredOtpHash = hashOtp(otp);

    if (otpSession.otpHash !== enteredOtpHash) {
      otpSession.attempts = (otpSession.attempts || 0) + 1;
      await otpSession.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    let user = await User.findOne({ mobile });

    if (!user) {
      user = await User.create({ mobile });
    }

    user = await ensureUserRole(user);

    const token = generateToken(user);
    await otpSession.deleteOne();

    res.json({ token });
  } catch (error) {
    console.log("Verify OTP error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
