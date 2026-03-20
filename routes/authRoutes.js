const express = require("express");
const router = express.Router();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // ensure correct path
const { loginUser } = require("../controllers/authController");

router.post("/login", loginUser);

// ================= SEND OTP =================
router.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;

  const mobileStr = String(mobile);

  console.log("MOBILE:", mobileStr);

  // OTP generate
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // Send SMS
    await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",
        message: `Your ParkingQR OTP is ${otp}. Do not share.`,
        numbers: mobileStr,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    // Store OTP
    global.otpStore = global.otpStore || {};
    global.otpStore[mobileStr] = otp;

    console.log("OTP STORED:", otp);

    res.json({ success: true });

  } catch (error) {
    console.log("SMS ERROR:", error.response?.data || error.message);
    res.status(500).json({ message: "OTP send failed" });
  }
});

// ================= VERIFY OTP =================
router.post("/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;

  const mobileStr = String(mobile);
  const enteredOtp = String(otp);

  console.log("VERIFY MOBILE:", mobileStr);
  console.log("ENTERED OTP:", enteredOtp);
  console.log("STORED OTP:", global.otpStore?.[mobileStr]);

  // Check OTP
  if (
    !global.otpStore ||
    global.otpStore[mobileStr] !== enteredOtp
  ) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  try {
    let user = await User.findOne({ mobile: mobileStr });

    if (!user) {
      user = await User.create({ mobile: mobileStr });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET
    );

    // delete OTP after success
    delete global.otpStore[mobileStr];

    res.json({ token });

  } catch (error) {
    console.log("VERIFY ERROR:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;