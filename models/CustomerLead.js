const mongoose = require("mongoose");

const customerLeadActivitySchema = new mongoose.Schema(
  {
    outcome: {
      type: String,
      enum: [
        "call_attempted",
        "not_answered",
        "busy",
        "call_back_later",
        "interested",
        "cold_customer",
        "wrong_number",
        "converted",
        "not_interested",
      ],
      default: "call_attempted",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    salesPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesPerson",
      default: null,
    },
    salesPersonName: {
      type: String,
      trim: true,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

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
    assignedSalesPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesPerson",
      default: null,
      index: true,
    },
    assignedSalesPersonName: {
      type: String,
      trim: true,
      default: "",
    },
    assignedAt: {
      type: Date,
      default: null,
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
    callAttempts: {
      type: Number,
      default: 0,
    },
    lastCallAttemptAt: {
      type: Date,
      default: null,
    },
    lastOutcome: {
      type: String,
      enum: [
        "call_attempted",
        "not_answered",
        "busy",
        "call_back_later",
        "interested",
        "cold_customer",
        "wrong_number",
        "converted",
        "not_interested",
      ],
      default: null,
    },
    nextFollowUpAt: {
      type: Date,
      default: null,
    },
    latestNote: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    activities: {
      type: [customerLeadActivitySchema],
      default: [],
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
  showroom: 1,
  assignedSalesPerson: 1,
  createdAt: -1,
});

customerLeadSchema.index({
  cityKey: 1,
  vehicleType: 1,
  brandKeys: 1,
  createdAt: -1,
});

module.exports = mongoose.model("CustomerLead", customerLeadSchema);
