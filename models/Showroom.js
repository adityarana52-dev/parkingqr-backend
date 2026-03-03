const mongoose = require("mongoose");

const showroomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      required: true,
    },

    // 🔥 NEW - State Code (MP, DL, MH etc.)
    stateCode: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2
    },

    // 🔥 NEW - Unique Showroom Code (MP00001)
    showroomCode: {
      type: String,
      unique: true,
      sparse: true
    },

    contactPerson: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      default: null,
    },

    commissionType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed"
    },

    commissionValue: {
      type: Number,
      default: 0
    },

    totalEarnings: {
      type: Number,
      default: 0
    },

    // 🔥 NEW - QR Tracking
    totalQRAllotted: {
      type: Number,
      default: 0
    },

    totalQRActivated: {
      type: Number,
      default: 0
    },

    // 🔥 NEW - Status Control
    isActive: {
      type: Boolean,
      default: true
    }

  },
  { timestamps: true }
);

module.exports = mongoose.model("Showroom", showroomSchema);