const express = require("express");
const router = express.Router();
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const User = require("../models/User");
const protect = require("../middleware/authMiddleware"); // agar already use ho raha hai
const MoveRequest = require("../models/MoveRequest");
const sendPushNotification = require("../utils/sendPushNotification");
const QRCodeLib = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");

console.log("QR ROUTES LOADED");

// GEnerate QR Code
router.post("/generate", async (req, res) => {
  try {
    const { count, sourceType = "direct", showroomId = null } = req.body;

    if (!count) {
      return res.status(400).json({ message: "Count required" });
    }

    // Agar showroom type hai to showroom validate karo
    if (sourceType === "showroom") {
      if (!showroomId) {
        return res.status(400).json({ message: "Showroom ID required" });
      }

      const showroom = await Showroom.findById(showroomId);
      if (!showroom) {
        return res.status(404).json({ message: "Showroom not found" });
      }
    }

    const qrList = [];

    for (let i = 1; i <= count; i++) {
      const qrId = `QR${Date.now()}${i}`;

      qrList.push({
        qrId,
        sourceType,
        showroom: sourceType === "showroom" ? showroomId : null,
      });
    }

    await QrCode.insertMany(qrList);

    res.json({
      message: `${count} QR codes generated successfully`,
      sourceType,
    });

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
// ✅ Activate QR (1 Subscription = 1 Active QR)
router.post("/activate", protect, async (req, res) => {
  try {

    const user = req.user;

    // Subscription validation
    if (!user.subscriptionActive) {
      return res.status(403).json({
        message: "Subscription inactive",
      });
    }

    if (
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt < new Date()
    ) {
      user.subscriptionActive = false;
      await user.save();

      return res.status(403).json({
        message: "Subscription expired. Please renew.",
      });
    }


    const { qrId, vehicleNumber, vehicleType, salesPerson } = req.body;

    if (!qrId || !vehicleNumber) {
      return res.status(400).json({
        message: "QR ID and vehicle number required",
      });
    }

    // Find QR
    const qr = await QrCode.findOne({ qrId }).populate("showroom");

    if (!qr) {
      return res.status(404).json({ message: "QR not found" });
    }

    if (qr.isAssigned) {
      return res.status(400).json({ message: "QR already activated" });
    }

    // 🔥 NEW BUSINESS RULE
    // Check if user already has an active QR
    const existingQr = await QrCode.findOne({
      assignedTo: req.user._id,
      isAssigned: true,
    });

    if (existingQr) {
      return res.status(400).json({
        message: "Subscription allows only 1 active vehiclee",
      });
    }

    // Assign QR
    qr.isAssigned = true;
    qr.assignedTo = req.user._id;
    qr.vehicleNumber = vehicleNumber;
    qr.vehicleType = vehicleType;
    qr.salesPerson = salesPerson || null;

    await qr.save();

    res.json({
      message: "QR activated successfully",
      qrId: qr.qrId,
      vehicleNumber: qr.vehicleNumber,
      showroom: qr.showroom ? qr.showroom.name : "Independent",
      salesPerson: qr.salesPerson,
    });

  } catch (error) {
    console.log("QR Activation Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});


// ✅ Public QR View (No Login Required)
// ✅ Public QR View (Secure – Number Masked)
router.get("/public/:qrId", async (req, res) => {
  try {
    const { qrId } = req.params;

    const qr = await QrCode.findOne({ qrId })
  .populate("showroom")
  .populate("assignedTo");

    if (!qr) {
      return res.status(404).send("<h2>QR Not Found</h2>");
    }

    if (!qr.isAssigned) {
      return res.status(400).send("<h2>QR Not Activated Yet</h2>");
    }

    // Mask mobile number
    const mobile = qr.assignedTo?.mobile;

    if (!mobile) {
      return res.status(400).send("<h2>Owner contact not available</h2>");
    }

    const masked =
      mobile.slice(0, 2) +
      "XXXXXX" +
      mobile.slice(-2);

    res.send(`
      <html>
        <head>
          <title>Vehicle Contact</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 30px;
              background-color: #f7f7f7;
            }
            .card {
              background: white;
              padding: 20px;
              border-radius: 12px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 400px;
              margin: auto;
            }
            h2 {
              margin-bottom: 20px;
            }
            p {
              font-size: 16px;
              margin: 10px 0;
            }
            button {
              padding: 12px 20px;
              font-size: 16px;
              border: none;
              border-radius: 8px;
              background-color: #111;
              color: white;
              margin-top: 15px;
              cursor: pointer;
            }

            .tow-btn {
              background: #B91C1C;
              color: white;
            }
                button:hover {
              background-color: #333;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🚗 Vehicle Details</h2>
            <p><strong>Vehicle Number:</strong> ${qr.vehicleNumber}</p>
            <p><strong>Showroom:</strong> ${qr.showroom ? qr.showroom.name : "N/A"}</p>
            <p><strong>Owner Contact:</strong> ${masked}</p>

            <form method="POST" action="/api/qr/move-request">
                <input type="hidden" name="qrId" value="${qr.qrId}" />
                <button type="submit">🔔 Request Vehicle Move</button>

                <input type="hidden" name="qrId" value="${qr.qrId}" />
                <input type="hidden" name="type" value="tow" />
                <button class="button tow-btn">
                  🚨 Toeing Your Vehicle
                </button>
            </form>

            
            <p style="margin-top:15px; font-size:14px;">
              Please contact politely if vehicle needs to be moved.
            </p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.log("Public QR Error:", error);
    res.status(500).send("<h2>Server Error</h2>");
  }
});

// ✅ Public Move Request (With 2-Minute Spam Protection)
router.post("/move-request", async (req, res) => {
  try {
    const { qrId, type = "move" } = req.body;

    if (!qrId) {
      return res.status(400).json({ message: "QR ID required" });
    }

    const qr = await QrCode.findOne({ qrId });

    if (!qr || !qr.isAssigned) {
      return res.status(400).json({ message: "Invalid QR" });
    }

    // ⏱ 2-minute spam protection (same logic)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const recentRequest = await MoveRequest.findOne({
      qr: qr._id,
      createdAt: { $gte: twoMinutesAgo },
    });

    if (recentRequest) {
      return res.send(`
        <html>
          <body style="text-align:center; font-family:Arial; padding:40px;">
            <h2>⚠ Please Wait</h2>
            <p>A request was already sent recently.</p>
            <p>Please wait 2 minutes before sending another request.</p>
          </body>
        </html>
      `);
    }

    // Create new request
    await MoveRequest.create({
      qr: qr._id,
      vehicleNumber: qr.vehicleNumber,
      type: type === "tow" ? "tow" : "move",
    });

    // Push notification
    const qrData = await QrCode.findOne({ qrId }).populate("assignedTo");

    if (
      qrData &&
      qrData.assignedTo &&
      qrData.assignedTo.expoPushToken
    ) {
      const title =
        type === "tow" ? "🚨 Towing Alert" : "🚗 Move Request";

      const message =
        type === "tow"
          ? `Towing request initiated for vehicle ${qrData.vehicleNumber}`
          : `Someone requested to move vehicle ${qrData.vehicleNumber}`;

      await sendPushNotification(
        qrData.assignedTo.expoPushToken,
        title,
        message
      );
    }

    res.send(`
      <html>
        <body style="text-align:center; font-family:Arial; padding:40px;">
          <h2>✅ Request Sent</h2>
          <p>The vehicle owner has been notified.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.log("Move/Tow Request Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


const axios = require("axios");

router.post("/call/:qrId", async (req, res) => {
  try {
    const { qrId } = req.params;
    const { callerNumber } = req.body;

    if (!callerNumber) {
      return res.status(400).json({ message: "Caller number required" });
    }

    const qr = await QrCode.findOne({ qrId }).populate("assignedTo");

    if (!qr || !qr.assignedTo) {
      return res.status(400).json({ message: "Invalid QR" });
    }

    const ownerNumber = qr.assignedTo.mobile;

    const url = `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/Calls/connect.json`;

    await axios.post(url, null, {
      params: {
        From: callerNumber,
        To: ownerNumber,
        CallerId: process.env.EXOTEL_VIRTUAL_NUMBER,
      },
    });

    res.json({ message: "Call initiated" });

  } catch (error) {
    console.log("CALL ERROR:", error.response?.data || error.message);
    res.status(500).json({ message: "Call failed" });
  }
});


// ✅ Get My Move Requests (Owner)


// ✅ Get My Move Requests (Owner)
// ✅ Get My Move Requests (Correct Filtering)
router.get("/my-move-requests", protect, async (req, res) => {
  try {
    // Pehle user ke QRs find karo
    const userQrs = await QrCode.find({
      assignedTo: req.user._id,
    });

    const qrIds = userQrs.map((qr) => qr._id);

    // Ab un QR ids ke move requests find karo
    const requests = await MoveRequest.find({
      qr: { $in: qrIds },
    })
      .sort({ createdAt: -1 });

    res.json(requests);

  } catch (error) {
    console.log("Fetch Move Requests Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get Move Request Count (Correct Version)
router.get("/my-move-requests-count", protect, async (req, res) => {
  try {
    const userQrs = await QrCode.find({
      assignedTo: req.user._id,
    });

    const qrIds = userQrs.map((qr) => qr._id);

    const count = await MoveRequest.countDocuments({
      qr: { $in: qrIds },
    });

    res.json({ count });

  } catch (error) {
    console.log("Count Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/generate-printable", async (req, res) => {
  try {
    const { count, sourceType = "direct", showroomId = null } = req.body;

    if (!count || count > 50) {
      return res.status(400).json({
        message: "Count required (max 50 per batch)",
      });
    }

    if (sourceType === "showroom") {
      if (!showroomId) {
        return res.status(400).json({ message: "Showroom ID required" });
      }

      const showroom = await Showroom.findById(showroomId);
      if (!showroom) {
        return res.status(404).json({ message: "Showroom not found" });
      }
    }

    const PDFDocument = require("pdfkit");
    const QRCode = require("qrcode");

    const qrList = [];

    for (let i = 1; i <= count; i++) {
      const qrId = `QR${Date.now()}${i}`;

      qrList.push({
        qrId,
        sourceType,
        showroom: sourceType === "showroom" ? showroomId : null,
      });
    }

    const savedQrs = await QrCode.insertMany(qrList);

    const doc = new PDFDocument({ margin: 20 });

res.setHeader("Content-Type", "application/pdf");
res.setHeader(
  "Content-Disposition",
  "attachment; filename=parkingqr-elite-batch.pdf"
);

doc.pipe(res);

const stickerWidth = 180;
const stickerHeight = 180;
const gap = 20;

let x = 40;
let y = 40;
let countPerRow = 3;
let itemCount = 0;

for (const qr of savedQrs) {
  const publicUrl = `https://parkingqr-backend.onrender.com/scan/${qr.qrId}`;
  const qrBuffer = await QRCode.toBuffer(publicUrl);

  // Black Background
  doc.rect(x, y, stickerWidth, stickerHeight).fill("#0F0F0F");

  // Outer Gold Border
  doc
    .lineWidth(2)
    .strokeColor("#C6A75E")
    .rect(x, y, stickerWidth, stickerHeight)
    .stroke();

  // Inner Gold Frame
  doc
    .lineWidth(1)
    .rect(x + 6, y + 6, stickerWidth - 12, stickerHeight - 12)
    .stroke();

  // Title
  doc
    .fillColor("#C6A75E")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("PARKING QR", x, y + 18, {
      width: stickerWidth,
      align: "center",
    });

  // Divider Line
  doc
    .moveTo(x + 30, y + 40)
    .lineTo(x + stickerWidth - 30, y + 40)
    .strokeColor("#C6A75E")
    .lineWidth(1)
    .stroke();

  // QR White Box
  const qrBoxSize = 105;
  const qrX = x + (stickerWidth - qrBoxSize) / 2;
  const qrY = y + 50;

  doc.rect(qrX, qrY, qrBoxSize, qrBoxSize).fill("#FFFFFF");

  doc.image(qrBuffer, qrX + 6, qrY + 6, {
    width: qrBoxSize - 12,
  });

  // Bottom Text
  doc
    .fillColor("#C6A75E")
    .fontSize(8)
    .font("Helvetica")
    .text("Scan for Owner Notification", x, y + 158, {
      width: stickerWidth,
      align: "center",
    });

  doc
    .text("Move Request • Toeing Your Vehicle", x, y + 168, {
      width: stickerWidth,
      align: "center",
    });

  doc
    .text("Emergency Contact Available", x, y + 178, {
      width: stickerWidth,
      align: "center",
    });

  doc
    .fontSize(6)
    .fillColor("#8C7A3A")
    .text("Premium Vehicle Contact System", x, y + 190, {
      width: stickerWidth,
      align: "center",
    });

  itemCount++;
  x += stickerWidth + gap;

  if (itemCount % countPerRow === 0) {
    x = 40;
    y += stickerHeight + gap;
  }

  if (y + stickerHeight > 760) {
    doc.addPage();
    x = 40;
    y = 40;
  }
}

doc.end();

  } catch (error) {
    console.log("Printable QR Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
