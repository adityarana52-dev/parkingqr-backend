const mongoose = require("mongoose");

const mechanicContactUnlockSchema = new mongoose.Schema(
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
    vehicleType: {
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
    selectedMechanicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MechanicPartner",
      default: null,
    },
    revealedMechanicIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MechanicPartner",
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

mechanicContactUnlockSchema.index({ razorpay_payment_id: 1 }, { unique: true });

module.exports = mongoose.model(
  "MechanicContactUnlock",
  mechanicContactUnlockSchema
);
