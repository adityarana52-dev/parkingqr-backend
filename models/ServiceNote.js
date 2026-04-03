const mongoose = require("mongoose");

const serviceIssueSchema = new mongoose.Schema(
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

const serviceNoteSchema = new mongoose.Schema(
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
    vehicleNumber: {
      type: String,
      default: null,
    },
    activatedShowroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
    },
    selectedShowroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom",
      default: null,
    },
    issues: {
      type: [serviceIssueSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "in_service", "archived"],
      default: "draft",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    inServiceAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    linkedService: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceHistory",
      default: null,
    },
    advisorRemarks: {
      type: String,
      trim: true,
      default: "",
    },
    resolutionSummary: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

serviceNoteSchema.index({ user: 1, qrId: 1, status: 1 });
serviceNoteSchema.index({ selectedShowroom: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model("ServiceNote", serviceNoteSchema);
