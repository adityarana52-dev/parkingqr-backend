const express = require("express");
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const router = express.Router();
const crypto = require("crypto");
const Payment = require("../models/Payment");

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


// ✅ VERIFY PAYMENT
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    // 💰 Store payment record
      await Payment.create({
        userId: req.user.id,
        razorpay_payment_id,
        razorpay_order_id,
        amount: 499, // for now fixed
        status: "success",
      });

    // ✅ Payment verified — activate subscription
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await User.findByIdAndUpdate(req.user.id, {
      subscriptionActive: true,
      subscriptionExpiresAt: expiry,
    });

    res.json({ success: true });

  } catch (error) {
    console.error("VERIFY ERROR:", error);
    res.status(500).json({ message: "Verification failed" });
  }
});


// 📊 ADMIN REVENUE DASHBOARD
router.get("/revenue", authMiddleware, async (req, res) => {
  try {
    // 1️⃣ Total Revenue
    const totalRevenueAgg = await Payment.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    // 2️⃣ Total Payments Count
    const totalPayments = await Payment.countDocuments();

    // 3️⃣ Monthly Breakdown
    const monthlyRevenue = await Payment.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
    ]);

    // 4️⃣ Last 10 Payments
    const recentPayments = await Payment.find()
      .sort({ paidAt: -1 })
      .limit(10)
      .populate("userId", "mobile");

    res.json({
      totalRevenue,
      totalPayments,
      monthlyRevenue,
      recentPayments,
    });
  } catch (error) {
    console.error("REVENUE ERROR:", error);
    res.status(500).json({ message: "Revenue fetch failed" });
  }
});

module.exports = router;