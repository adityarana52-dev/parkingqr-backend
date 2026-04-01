const mongoose = require("mongoose");

const commissionWithdrawalSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    salesPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesPerson",
      default: null,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      index: true,
    },
    requestedAmount: {
      type: Number,
      required: true,
    },
    totalActivations: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    payoutMode: {
      type: String,
      enum: ["upi", "bank"],
      default: null,
    },
    payoutDetailsSnapshot: {
      accountHolderName: { type: String, default: null },
      upiId: { type: String, default: null },
      accountNumber: { type: String, default: null },
      ifsc: { type: String, default: null },
      bankName: { type: String, default: null },
    },
    requestNote: {
      type: String,
      default: "",
      trim: true,
    },
    paymentNote: {
      type: String,
      default: "",
      trim: true,
    },
    transactionRef: {
      type: String,
      default: "",
      trim: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

commissionWithdrawalSchema.index(
  { entityType: 1, entityId: 1, monthKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("CommissionWithdrawal", commissionWithdrawalSchema);
