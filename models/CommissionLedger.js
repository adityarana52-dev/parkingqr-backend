const mongoose = require("mongoose");

const commissionLedgerSchema = new mongoose.Schema(
  {
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
    qr: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrCode",
      required: true,
      unique: true,
    },
    qrId: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    vehicleNumber: {
      type: String,
      default: null,
    },
    activatedAt: {
      type: Date,
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      index: true,
    },
    subscriptionAmount: {
      type: Number,
      default: 299,
    },
    showroomCommission: {
      type: Number,
      default: 0,
    },
    salesCommission: {
      type: Number,
      default: 0,
    },
    showroomCommissionType: {
      type: String,
      default: null,
    },
    showroomCommissionValue: {
      type: Number,
      default: null,
    },
    salesCommissionType: {
      type: String,
      default: null,
    },
    salesCommissionValue: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommissionLedger", commissionLedgerSchema);
