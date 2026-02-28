const mongoose = require("mongoose");

const qrOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: String,
    mobile: String,
    address: String,
    city: String,
    state: String,
    pincode: String,

    razorpay_payment_id: String,
    razorpay_order_id: String,

    amount: {
      type: Number,
      default: 50,
    },

    status: {
      type: String,
      enum: ["processing", "shipped", "delivered", "cancelled"],
      default: "processing",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QrOrder", qrOrderSchema);