const mongoose = require("mongoose");

const mechanicPartnerSchema = new mongoose.Schema(
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
      max: 25,
    },
    vehicleTypes: [
      {
        type: String,
        trim: true,
      },
    ],
    vehicleTypeKeys: [
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

mechanicPartnerSchema.index({
  city: 1,
  area: 1,
  isActive: 1,
  status: 1,
  vehicleTypeKeys: 1,
});

module.exports = mongoose.model("MechanicPartner", mechanicPartnerSchema);
