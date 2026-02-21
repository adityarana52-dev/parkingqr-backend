const express = require("express");
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// ✅ CREATE ORDER (Hardcoded ₹499)
router.post("/create-order", authMiddleware, async (req, res) => {
  try {

    const amount = 499; // ₹499 fixed plan for now

    const options = {
      amount: amount * 100, // Razorpay needs paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    res.status(500).json({
      message: "Order creation failed",
      error: error.message,
    });
  }
});

// ✅ ACTIVATE SUBSCRIPTION
router.post("/activate", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // authMiddleware se aayega

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30); // 30 days plan

    await User.findByIdAndUpdate(userId, {
      subscriptionActive: true,
      subscriptionExpiresAt: expiry,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("ACTIVATE ERROR:", error);
    res.status(500).json({ message: "Activation failed" });
  }
});

module.exports = router;