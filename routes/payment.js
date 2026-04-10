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
const QrCode = require("../models/QrCode");
const REPLACEMENT_QR_REPRINT_AMOUNT = 70;

function adminOrEmployee(req, res, next) {
  if (!req.user || !["admin", "employee"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin or employee access only" });
  }

  next();
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function getLatestShippingLikeOrder(userId) {
  return QrOrder.findOne({
    user: userId,
    status: { $in: ["processing", "shipped", "delivered"] },
  }).sort({ createdAt: -1 });
}

async function getActiveQrForUser(userId) {
  return QrCode.findOne({
    assignedTo: userId,
    qrStatus: "activated",
  }).sort({ activatedAt: -1, createdAt: -1 });
}


// ✅ CREATE ORDER (Hardcoded ₹499)
router.post("/create-order", authMiddleware, async (req, res) => {
  try {

    const { vehicleType } = req.body;  // 👈 ADD THIS

    let amount = 399;

    if (vehicleType === "bike" || vehicleType === "scooty") {
      amount = 299;
    }

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      finalAmount: amount   // 👈 ADD THIS (important)
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

    const { vehicleType } = req.body;

        let amount = 399;

        if (vehicleType === "bike" || vehicleType === "scooty") {
          amount = 299;
        }

        await Payment.create({
          userId: req.user.id,
          razorpay_payment_id,
          razorpay_order_id,
          amount: amount,   // 👈 dynamic
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

router.get("/replacement-details", authMiddleware, async (req, res) => {
  try {
    const [user, activeQr, latestOrder] = await Promise.all([
      User.findById(req.user._id).select("mobile"),
      getActiveQrForUser(req.user._id),
      getLatestShippingLikeOrder(req.user._id),
    ]);

    if (!activeQr) {
      return res.status(404).json({
        message: "No active QR found for replacement.",
      });
    }

    res.json({
      qrId: activeQr.qrId,
      vehicleNumber: activeQr.vehicleNumber,
      vehicleType: activeQr.vehicleType,
      mobile: user?.mobile || "",
      name: latestOrder?.name || "",
      address: latestOrder?.address || "",
      city: latestOrder?.city || "",
      state: latestOrder?.state || "",
      pincode: latestOrder?.pincode || "",
    });
  } catch (error) {
    console.error("REPLACEMENT DETAILS ERROR:", error);
    res.status(500).json({ message: "Failed to load replacement details" });
  }
});

router.post("/create-replacement-order", authMiddleware, async (req, res) => {
  try {
    const activeQr = await getActiveQrForUser(req.user._id);

    if (!activeQr) {
      return res.status(404).json({
        message: "No active QR found for replacement.",
      });
    }

    const amount = REPLACEMENT_QR_REPRINT_AMOUNT;
    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: "replacement_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      qrId: activeQr.qrId,
      vehicleType: activeQr.vehicleType,
    });
  } catch (error) {
    console.error("CREATE REPLACEMENT ORDER ERROR:", error);
    res.status(500).json({
      message: "Replacement order creation failed",
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
      vehicleType
    } = req.body;

    // update user city
        if(city){
        await User.findByIdAndUpdate(
        req.user._id,
        { city: city }
        );
}

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
  vehicleType
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
        qr.vehicleType = vehicleType;

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

router.post("/verify-replacement-order", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      qrId,
      name,
      mobile,
      address,
      city,
      state,
      pincode,
    } = req.body;

    const activeQr = await getActiveQrForUser(req.user._id);

    if (!activeQr || activeQr.qrId !== String(qrId || "").trim()) {
      return res.status(400).json({
        message: "Active QR not found for replacement.",
      });
    }

    if (city) {
      await User.findByIdAndUpdate(req.user._id, { city });
    }

    const existingPayment = await Payment.findOne({ razorpay_payment_id });
    if (existingPayment) {
      return res.json({
        success: true,
        message: "Payment already processed",
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

    await Payment.create({
      userId: req.user._id,
      razorpay_payment_id,
      razorpay_order_id,
      amount: REPLACEMENT_QR_REPRINT_AMOUNT,
      status: "shipping-success",
    });

    const order = await QrOrder.create({
      user: req.user._id,
      name,
      mobile,
      address,
      city,
      state,
      pincode,
      paymentId: razorpay_payment_id,
      vehicleType: activeQr.vehicleType,
      qrId: activeQr.qrId,
      orderType: "replacement",
      quantity: 1,
    });

    res.json({
      success: true,
      orderId: order._id,
      qrId: activeQr.qrId,
    });
  } catch (error) {
    console.error("VERIFY REPLACEMENT ERROR:", error);
    res.status(500).json({ message: "Replacement verification failed" });
  }
});


router.put("/qr-orders/:id", authMiddleware, adminOrEmployee, async (req, res) => {
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
router.get("/admin-orders", authMiddleware, adminOrEmployee, async (req, res) => {

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
