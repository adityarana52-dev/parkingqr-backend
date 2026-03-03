const mongoose = require("mongoose");

const moveRequestSchema = new mongoose.Schema(
  {
    qr: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrCode",
      required: true,
    },
    vehicleNumber: String,

     type: {
      type: String,
      enum: ["move", "tow"],
      default: "move",
    },

    location: {
        latitude: Number,
        longitude: Number,
      },

    requestedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MoveRequest", moveRequestSchema);
