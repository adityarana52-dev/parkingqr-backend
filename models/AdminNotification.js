const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    audience: {
      type: String,
      enum: [
        "all_users",
        "active_subscribers",
        "inactive_users",
        "all_showrooms",
        "active_showrooms",
        "all_drivers",
        "active_drivers",
      ],
      default: "all_users",
      index: true,
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
