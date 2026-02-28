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

    status: {
      type: String,
      enum: ["processing", "shipped", "delivered"],
      default: "processing",
    },

    paymentId: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("QrOrder", qrOrderSchema);