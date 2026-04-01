const mongoose = require("mongoose");

const payoutDetailsSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["showroom", "salesperson"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
      index: true,
    },
    mode: {
      type: String,
      enum: ["upi", "bank"],
      required: true,
    },
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },
    upiId: {
      type: String,
      default: null,
      trim: true,
    },
    accountNumber: {
      type: String,
      default: null,
      trim: true,
    },
    ifsc: {
      type: String,
      default: null,
      trim: true,
    },
    bankName: {
      type: String,
      default: null,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

payoutDetailsSchema.index({ entityType: 1, entityId: 1 }, { unique: true });

module.exports = mongoose.model("PayoutDetails", payoutDetailsSchema);
