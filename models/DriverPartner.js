const mongoose = require("mongoose");

const driverPartnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    expoPushToken: {
      type: String,
      default: null,
    },
    stateCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    area: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine1: {
      type: String,
      trim: true,
      default: "",
    },
    serviceRadiusKm: {
      type: Number,
      default: 5,
      min: 1,
      max: 30,
    },
    vehicleCategories: [
      {
        type: String,
        trim: true,
      },
    ],
    vehicleCategoryKeys: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    location: {
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
    },
    onlineStatus: {
      type: Boolean,
      default: false,
    },
    liveLocation: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

driverPartnerSchema.index({
  city: 1,
  area: 1,
  isActive: 1,
  status: 1,
  vehicleCategoryKeys: 1,
});

module.exports = mongoose.model("DriverPartner", driverPartnerSchema);
