const mongoose = require("mongoose");

const salesPersonSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  showroom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Showroom"
  },
  commissionType: {
    type: String,
    enum: ["fixed", "percentage"],
    default: "fixed"
  },
  commissionValue: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model("SalesPerson", salesPersonSchema);