const mongoose = require("mongoose");

const driverContactUnlockSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    clientKey: {
      type: String,
      trim: true,
      default: "",
    },
    requestIp: {
      type: String,
      trim: true,
      default: "",
    },
    vehicleCategory: {
      type: String,
      required: true,
      trim: true,
    },
    issue: {
      type: String,
      trim: true,
      default: "",
    },
    query: {
      type: String,
      trim: true,
      default: "",
    },
    searchLocation: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
    selectedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverPartner",
      default: null,
    },
    revealedDriverIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverPartner",
      },
    ],
    razorpay_payment_id: {
      type: String,
      required: true,
      trim: true,
    },
    razorpay_order_id: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 10,
    },
    status: {
      type: String,
      default: "success",
    },
  },
  {
    timestamps: true,
  }
);

driverContactUnlockSchema.index({ razorpay_payment_id: 1 }, { unique: true });
driverContactUnlockSchema.index({ createdAt: 1, clientKey: 1 });
driverContactUnlockSchema.index({ createdAt: 1, requestIp: 1 });

module.exports = mongoose.model("DriverContactUnlock", driverContactUnlockSchema);
