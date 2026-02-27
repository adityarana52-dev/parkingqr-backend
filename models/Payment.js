const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  razorpay_payment_id: {
    type: String,
    required: true,
  },
  razorpay_order_id: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    default: "success",
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
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

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    // ✅ Save order inside user
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        qrOrders: {
          name,
          mobile,
          address,
          city,
          state,
          pincode,
          paidAt: new Date(),
          status: "processing",
        },
      },
    });

    res.json({ success: true });

  } catch (error) {
    console.error("VERIFY SHIPPING ERROR:", error);
    res.status(500).json({ message: "Shipping verification failed" });
  }
});

module.exports = mongoose.model("Payment", paymentSchema);