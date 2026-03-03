const mongoose = require("mongoose");

const salesPersonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    mobile: {
      type: String,
      default: null,
    },

    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      required: true,
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

    // 🔥 NEW - Activation tracking
    totalActivations: {
      type: Number,
      default: 0
    },

    // 🔥 NEW - Active/Inactive control
    isActive: {
      type: Boolean,
      default: true
    }

  },
  { timestamps: true }
);

module.exports = mongoose.model("SalesPerson", salesPersonSchema);