const express = require("express");
const router = express.Router();
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware"); // agar already use ho raha hai



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

// ✅ Activate QR (Customer assigns to vehicle)
router.post("/activate", protect, async (req, res) => {
  try {
    const { qrId, vehicleNumber } = req.body;

    if (!qrId || !vehicleNumber) {
      return res.status(400).json({ message: "QR ID and vehicle number required" });
    }

    const qr = await QrCode.findOne({ qrId });

    if (!qr) {
      return res.status(404).json({ message: "QR not found" });
    }

    if (qr.isAssigned) {
      return res.status(400).json({ message: "QR already activated" });
    }

    // Assign QR
    qr.isAssigned = true;
    qr.assignedTo = req.user._id;
    qr.vehicleNumber = vehicleNumber;

    await qr.save();

    res.json({
      message: "QR activated successfully",
      qrId: qr.qrId,
      vehicleNumber: qr.vehicleNumber,
    });

  } catch (error) {
    console.log("QR Activation Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Public QR View (No Login Required)
router.get("/public/:qrId", async (req, res) => {
  try {
    const { qrId } = req.params;

    const qr = await QrCode.findOne({ qrId })
      .populate("assignedTo")
      .populate("showroom");

    if (!qr) {
      return res.status(404).send("<h2>QR Not Found</h2>");
    }

    if (!qr.isAssigned) {
      return res.status(400).send("<h2>QR Not Activated Yet</h2>");
    }

    // Basic HTML response
    res.send(`
      <html>
        <head>
          <title>Vehicle Contact</title>
          <style>
            body { font-family: Arial; text-align: center; padding: 40px; }
            .card { border: 1px solid #ddd; padding: 20px; border-radius: 10px; max-width: 400px; margin: auto; }
            button { padding: 10px 20px; font-size: 16px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🚗 Vehicle Details</h2>
            <p><strong>Vehicle Number:</strong> ${qr.vehicleNumber}</p>
            <p><strong>Showroom:</strong> ${qr.showroom?.name || "N/A"}</p>

            <a href="tel:${qr.assignedTo.mobile}">
              <button>📞 Call Owner</button>
            </a>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.log("Public QR Error:", error);
    res.status(500).send("<h2>Server Error</h2>");
  }
});



module.exports = router;
