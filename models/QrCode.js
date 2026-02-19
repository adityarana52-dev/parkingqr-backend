const mongoose = require("mongoose");

const qrSchema = new mongoose.Schema(
  {
    qrId: { type: String, required: true, unique: true },

    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
    },

    salesPerson: {
      type: String,
      default: null,
    },

    isAssigned: { type: Boolean, default: false },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    vehicleNumber: { type: String, default: null },

    activatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QrCode", qrSchema);
