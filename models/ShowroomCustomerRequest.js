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

const pickupTrackingSchema = new mongoose.Schema(
  {
    driverName: {
      type: String,
      trim: true,
      default: "",
    },
    driverMobile: {
      type: String,
      trim: true,
      default: "",
    },
    currentStage: {
      type: String,
      enum: [
        "not_started",
        "pickup_assigned",
        "vehicle_picked",
        "reached_service_center",
        "service_in_progress",
        "service_completed",
      ],
      default: "not_started",
    },
    pickupAssignedAt: {
      type: Date,
      default: null,
    },
    vehiclePickedAt: {
      type: Date,
      default: null,
    },
    reachedServiceCenterAt: {
      type: Date,
      default: null,
    },
    serviceInProgressAt: {
      type: Date,
      default: null,
    },
    serviceCompletedAt: {
      type: Date,
      default: null,
    },
    reachedServiceCenterScan: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      accuracy: {
        type: Number,
        default: null,
      },
      scannedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { _id: false }
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
    pickupTracking: {
      type: pickupTrackingSchema,
      default: () => ({}),
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
