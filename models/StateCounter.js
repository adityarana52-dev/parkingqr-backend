const mongoose = require("mongoose");

const stateCounterSchema = new mongoose.Schema(
  {
    stateCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2
    },

    lastNumber: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StateCounter", stateCounterSchema);