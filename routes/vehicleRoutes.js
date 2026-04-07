const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const QrCode = require("../models/QrCode");
const MoveRequest = require("../models/MoveRequest");
const ServiceNote = require("../models/ServiceNote");
const ShowroomCustomerRequest = require("../models/ShowroomCustomerRequest");
const CommissionLedger = require("../models/CommissionLedger");

function normalizeVehicleNumber(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .trim();
}

// GET My Vehicles
router.get("/my", protect, async (req, res) => {
  try {
    const vehicles = await QrCode.find({
      assignedTo: req.user._id,
    });

    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:qrId/number", protect, async (req, res) => {
  try {
    const { qrId } = req.params;
    const normalizedVehicleNumber = normalizeVehicleNumber(req.body?.vehicleNumber);

    if (!qrId) {
      return res.status(400).json({ message: "QR ID required" });
    }

    if (!normalizedVehicleNumber) {
      return res.status(400).json({ message: "Valid vehicle number required" });
    }

    const qr = await QrCode.findOne({
      qrId,
      assignedTo: req.user._id,
      qrStatus: "activated",
    });

    if (!qr) {
      return res.status(404).json({ message: "Activated vehicle not found" });
    }

    qr.vehicleNumber = normalizedVehicleNumber;
    await qr.save();

    await Promise.all([
      MoveRequest.updateMany(
        { qr: qr._id },
        { $set: { vehicleNumber: normalizedVehicleNumber } }
      ),
      ServiceNote.updateMany(
        { qr: qr._id },
        { $set: { vehicleNumber: normalizedVehicleNumber } }
      ),
      ShowroomCustomerRequest.updateMany(
        { qr: qr._id },
        { $set: { vehicleNumber: normalizedVehicleNumber } }
      ),
      CommissionLedger.updateOne(
        { qr: qr._id },
        { $set: { vehicleNumber: normalizedVehicleNumber } }
      ),
    ]);

    res.json({
      message: "Vehicle number updated successfully",
      qrId: qr.qrId,
      vehicleNumber: qr.vehicleNumber,
    });
  } catch (error) {
    console.log("Update vehicle number error", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
