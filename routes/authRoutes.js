const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { loginUser } = require("../controllers/authController");

router.post("/login", loginUser);

// ================= VERIFY (Firebase OTP के बाद) =================
router.post("/verify-otp", async (req, res) => {
  const { mobile } = req.body;

  const mobileStr = String(mobile);

  console.log("LOGIN MOBILE:", mobileStr);

  try {
    let user = await User.findOne({ mobile: mobileStr });

    if (!user) {
      user = await User.create({ mobile: mobileStr });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET
    );

    res.json({ token });

  } catch (error) {
    console.log("VERIFY ERROR:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;