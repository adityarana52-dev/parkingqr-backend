const mongoose = require("mongoose");

const employeeAccessSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      enum: ["employee"],
      default: "employee",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmployeeAccess", employeeAccessSchema);
