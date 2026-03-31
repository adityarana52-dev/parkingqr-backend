const mongoose = require("mongoose");

const serviceHistorySchema = new mongoose.Schema(
  {
    qr: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrCode",
      required: true
    },

    qrId: {
      type: String,
      required: true
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    showroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Showroom"
    },

    serviceType: {
      type: String,
      enum: [
        "first_service",
        "second_service",
        "third_service",
        "regular_checkup",
        "regular_service"
      ],
      required: true
    },

    amount: {
      type: Number,
      default: 0
    },

    serviceDate: {
      type: Date,
      default: Date.now
    }, 

    nextServiceDate: {
        type: Date,
        default: null
},
serviceNumber: {
  type: Number,
  default: null
}

  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceHistory", serviceHistorySchema);