const express = require("express");
const Razorpay = require("razorpay");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const router = express.Router();
const crypto = require("crypto");
const Payment = require("../models/Payment");
const adminMiddleware = require("../middleware/adminMiddleware");
const QrOrder = require("../models/QrOrder");
const sendPushNotification = require("../utils/sendPushNotification");

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
    expiry.setFullYear(expiry.getFullYear() + 1);   // 🔥 1 Year Plan

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
router.get("/revenue", authMiddleware, adminMiddleware, async (req, res) => {
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


// ===============================
// 🚚 CREATE SHIPPING ORDER (₹50)
// ===============================
router.post("/create-shipping-order", authMiddleware, async (req, res) => {
  try {
    const amount = 50; // ₹50 shipping

    const options = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "shipping_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {
    console.error("CREATE SHIPPING ORDER ERROR:", error);
    res.status(500).json({
      message: "Shipping order creation failed",
    });
  }
});

// ===============================
// 🚚 VERIFY SHIPPING PAYMENT
// ===============================
router.post("/verify-shipping", authMiddleware, async (req, res) => {
  try {
        


    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      name,
      mobile,
      address,
      city,
      state,
      pincode,
    } = req.body;

    // 🚫 Prevent duplicate payment processing
    const existingPayment = await Payment.findOne({
      razorpay_payment_id
    });

    if (existingPayment) {

      console.log("⚠ Duplicate shipping payment blocked");

      return res.json({
        success: true,
        message: "Payment already processed"
      });

    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

        // ✅ Save payment record
    await Payment.create({
      userId: req.user._id,
      razorpay_payment_id,
      razorpay_order_id,
      amount: 50,
      status: "shipping-success",
    });

   

// create order
const order = await QrOrder.create({
  user: req.user._id,
  name,
  mobile,
  address,
  city,
  state,
  pincode,
  paymentId: razorpay_payment_id,
});

      // find unused direct QR
      const qr = await QrCode.findOne({
        sourceType: "direct",
        isAssigned: false
      }).sort({ createdAt: 1 });

      if (qr) {

        qr.isAssigned = true;
        qr.assignedTo = req.user._id;
        qr.orderId = order._id;
        qr.qrStatus = "assigned";

        await qr.save();

        order.qrId = qr.qrId;
        await order.save();

        console.log("QR ASSIGNED:", qr.qrId);

      } else {

        console.log("NO DIRECT QR AVAILABLE");

      }

    res.json({ success: true });

  } catch (error) {
    console.error("VERIFY SHIPPING ERROR:", error);
    res.status(500).json({ message: "Shipping verification failed" });
  }
});


router.put("/qr-orders/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    const order = await QrOrder.findById(req.params.id).populate("user");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    await order.save();

    // 🔔 SEND PUSH NOTIFICATION TO USER
    if (order.user.expoPushToken) {
      await sendPushNotification(
        order.user.expoPushToken,
        "📦 QR Order Update",
        `Your QR order is now ${status.toUpperCase()}`,
         { type: "order" }   // 👈 ADD THIS
      );
    }

    res.json(order);

  } catch (error) {
    console.error("Status update failed:", error);
    res.status(500).json({ message: "Status update failed" });
  }
});



router.get("/my-qr-orders", authMiddleware, async (req, res) => {
  try {
    const orders = await QrOrder.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user orders" });
  }
});

// ===============================
// 📊 ADMIN BUSINESS STATS
// ===============================
router.get("/admin-stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const QrCode = require("../models/QrCode");
    const QrOrder = require("../models/QrOrder");

    // 🔹 Showroom activations
    const showroomActivations = await QrCode.countDocuments({
      showroom: { $ne: null },
      isAssigned: true,
    });

    // 🔹 Direct activations
    const directActivations = await QrCode.countDocuments({
      showroom: null,
      isAssigned: true,
    });

    // 🔹 Subscription revenue
    const subscriptionRevenueAgg = await Payment.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const subscriptionRevenue =
      subscriptionRevenueAgg[0]?.total || 0;

    // 🔹 Shipping revenue
    const shippingRevenueAgg = await Payment.aggregate([
      { $match: { status: "shipping-success" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const shippingRevenue =
      shippingRevenueAgg[0]?.total || 0;

    // 🔹 Total QR orders
    const totalQrOrders = await QrOrder.countDocuments();

    res.json({
      showroomActivations,
      directActivations,
      subscriptionRevenue,
      shippingRevenue,
      totalQrOrders,
    });

  } catch (error) {
    console.error("ADMIN STATS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});


// ===============================
// 📦 ADMIN QR ORDERS LIST
// ===============================
router.get("/admin-orders", authMiddleware, adminMiddleware, async (req, res) => {

  try {

    const orders = await QrOrder.find()
      .sort({ createdAt: -1 })
      .populate("user", "mobile");

    res.json(orders);

  } catch (error) {

    console.log("ADMIN ORDERS ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch orders"
    });

  }

});

module.exports = router;