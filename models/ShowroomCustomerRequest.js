const mongoose = require("mongoose");

const customerRequestIssueSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
  },
  { _id: true }
);

const showroomCustomerRequestSchema = new mongoose.Schema(
  {
    qr: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrCode",
      required: true,
    },
    qrId: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      required: true,
      index: true,
    },
    vehicleNumber: {
      type: String,
      default: null,
    },
    requestType: {
      type: String,
      enum: ["service_booking", "insurance_quote"],
      required: true,
      index: true,
    },
    issues: {
      type: [customerRequestIssueSchema],
      default: [],
    },
    preferredServiceDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["new", "contacted", "accepted", "rejected", "closed"],
      default: "new",
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

showroomCustomerRequestSchema.index({
  showroom: 1,
  status: 1,
  requestedAt: -1,
});

module.exports = mongoose.model(
  "ShowroomCustomerRequest",
  showroomCustomerRequestSchema
);
