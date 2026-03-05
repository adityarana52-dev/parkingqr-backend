const mongoose = require("mongoose");

const qrRequestSchema = new mongoose.Schema(
{
  showroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Showroom",
    required: true
  },

  quantity: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  }

},
{ timestamps: true }
);

module.exports = mongoose.model("QrRequest", qrRequestSchema);