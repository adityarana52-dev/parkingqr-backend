const mongoose = require("mongoose");

const qrCodeSchema = new mongoose.Schema(
  {
    qrId: {
      type: String,
      required: true,
      unique: true,
    },
    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
    },

    sourceType: {
      type: String,
      enum: ["showroom", "retail", "direct"],
      default: "direct",
    },
    salesPerson:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"SalesPerson",
      default:null
    },
    isAssigned: {
      type: Boolean,
      default: false,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    vehicleType: {
  type: String,
},

    vehicleNumber: {
      type: String,
      default: null,
    },

        insuranceStartDate: {
      type: Date,
      default: null
    },

    insuranceExpiryDate: {
      type: Date,
      default: null
    },

    lastServiceDate: {
      type: Date,
      default: null
    },

    nextServiceDate: {
      type: Date,
      default: null
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrOrder",
      default: null
    },

    qrStatus: {
      type: String,
      enum: ["generated", "assigned", "activated"],
      default: "generated"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("QrCode", qrCodeSchema);
