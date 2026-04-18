const mongoose = require("mongoose");

const customerLeadSchema = new mongoose.Schema(
  {
    leadGroupId: {
      type: String,
      required: true,
      index: true,
    },
    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
      index: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vehicleType: {
      type: String,
      enum: ["car", "bike", "auto"],
      required: true,
      index: true,
    },
    brands: {
      type: [String],
      default: [],
    },
    brandKeys: {
      type: [String],
      default: [],
      index: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["guest_home"],
      default: "guest_home",
    },
    status: {
      type: String,
      enum: ["new", "contacted", "closed", "unassigned"],
      default: "new",
      index: true,
    },
    matchedShowroomCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

customerLeadSchema.index({
  showroom: 1,
  status: 1,
  createdAt: -1,
});

customerLeadSchema.index({
  cityKey: 1,
  vehicleType: 1,
  brandKeys: 1,
  createdAt: -1,
});

module.exports = mongoose.model("CustomerLead", customerLeadSchema);
