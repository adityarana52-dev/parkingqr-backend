const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const QrCode = require("../models/QrCode");

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

module.exports = router;
