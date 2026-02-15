const express = require("express");
const router = express.Router();
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");


// ✅ Generate QR codes (Temporary Admin Use)
router.post("/generate", async (req, res) => {
  try {
    const { count } = req.body;

    if (!count) {
      return res.status(400).json({ message: "Count required" });
    }

    const qrList = [];

    for (let i = 1; i <= count; i++) {
      const qrId = `QR${Date.now()}${i}`;

      qrList.push({
        qrId,
      });
    }

    await QrCode.insertMany(qrList);

    res.json({ message: `${count} QR codes generated successfully` });

  } catch (error) {
    console.log("Generate QR Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ✅ Allocate QR codes to showroom
router.post("/allocate", async (req, res) => {
  try {
    const { showroomId, quantity } = req.body;

    if (!showroomId || !quantity) {
      return res.status(400).json({ message: "Showroom ID and quantity required" });
    }

    const showroom = await Showroom.findById(showroomId);
    if (!showroom) {
      return res.status(404).json({ message: "Showroom not found" });
    }

    const availableQrs = await QrCode.find({
      showroom: null,
    }).limit(quantity);

    if (availableQrs.length < quantity) {
      return res.status(400).json({ message: "Not enough QR codes available" });
    }

    const qrIds = availableQrs.map((qr) => qr._id);

    await QrCode.updateMany(
      { _id: { $in: qrIds } },
      { showroom: showroomId }
    );

    res.json({
      message: `${quantity} QR codes allocated to ${showroom.name}`,
    });

  } catch (error) {
    console.log("Allocate QR Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


module.exports = router;
