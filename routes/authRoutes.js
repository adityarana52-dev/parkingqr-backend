const express = require("express");
const router = express.Router();
const { loginUser } = require("../controllers/authController");

router.post("/login", loginUser);

const axios = require("axios");

router.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;

  console.log("MOBILE:", mobile);
  console.log("API KEY:", process.env.FAST2SMS_API_KEY);

  const otp = Math.floor(100000 + Math.random() * 900000);

  try {
    await axios.get("https://www.fast2sms.com/dev/bulkV2", {
            headers: {
                authorization: `Bearer ${process.env.FAST2SMS_API_KEY}`,
            },
            params: {
                route: "otp",
                variables_values: otp,
                numbers: mobile,
            },
            });

    // 🔥 store OTP temporarily
    global.otpStore = global.otpStore || {};
    global.otpStore[mobile] = otp;

    console.log("OTP:", otp); // debug

    res.json({ success: true });

  } catch (error) {
    console.log("SMS error", error);
    res.status(500).json({ message: "OTP send failed" });
  }
});


router.post("/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;

  if (!global.otpStore || global.otpStore[mobile] != otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  let user = await User.findOne({ mobile });

  if (!user) {
    user = await User.create({ mobile });
  }

  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET
  );

  delete global.otpStore[mobile];

  res.json({ token });
});


module.exports = router;
