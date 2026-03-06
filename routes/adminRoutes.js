const express = require("express");
const router = express.Router();

const QrRequest = require("../models/QrRequest");
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const User = require("../models/User");
const SalesPerson = require("../models/SalesPerson");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

router.get("/qr-requests", async (req, res) => {

  try {

    const requests = await QrRequest.find()
      .populate("showroom", "name showroomCode city")
      .sort({ createdAt: -1 });

    res.json(requests);

  } catch (error) {

    console.log("Admin QR Request Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.patch("/approve-request/:id", async (req, res) => {

  try {

    const request = await QrRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        message: "Request not found"
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Request already processed"
      });
    }

    const quantity = request.quantity;

    const qrList = [];

    for (let i = 1; i <= quantity; i++) {

      const qrId = `QR${Date.now()}${Math.floor(Math.random()*10000)}`;

      qrList.push({
        qrId,
        sourceType: "showroom",
        showroom: request.showroom
      });

    }

    await QrCode.insertMany(qrList);

    await Showroom.findByIdAndUpdate(
      request.showroom,
      { $inc: { totalQRAllotted: quantity } }
    );

    request.status = "approved";
    await request.save();

    res.json({
      message: `${quantity} QR codes generated and allocated`
    });

  } catch (error) {

    console.log("Approve Request Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.patch("/reject-request/:id", async (req, res) => {

  try {

    const request = await QrRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        message: "Request not found"
      });
    }

    request.status = "rejected";

    await request.save();

    res.json({
      message: "Request rejected"
    });

  } catch (error) {

    console.log("Reject Request Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.get("/dashboard", async (req, res) => {

  try {

        const pendingRequests = await QrRequest.countDocuments({
    status: "pending"
    });

    const SUBSCRIPTION_PRICE = 299;

    // Basic counts
    const totalUsers = await User.countDocuments();
    const totalShowrooms = await Showroom.countDocuments();
    const totalQrGenerated = await QrCode.countDocuments();

    const totalQrActivated = await QrCode.countDocuments({
      isAssigned: true
    });

    // Business revenue
    const businessRevenue = totalQrActivated * SUBSCRIPTION_PRICE;

    // Showroom commission
    const showroomCommission = await Showroom.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$totalEarnings" }
        }
      }
    ]);

    const showroomTotal = showroomCommission[0]?.total || 0;

    // Salesperson commission
    const salesCommission = await SalesPerson.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$totalEarnings" }
        }
      }
    ]);

    const salesTotal = salesCommission[0]?.total || 0;

    // Net profit
    const netProfit = businessRevenue - showroomTotal - salesTotal;

    // Top showrooms
    const topShowrooms = await Showroom.find()
      .sort({ totalEarnings: -1 })
      .limit(5)
      .select("name showroomCode city totalQRActivated totalEarnings");

    // Top salespersons
    const topSalesPersons = await SalesPerson.find()
      .sort({ totalEarnings: -1 })
      .limit(5)
      .populate("showroom", "name showroomCode")
      .select("name totalActivations totalEarnings");

    res.json({

      totalUsers,
      totalShowrooms,
      totalQrGenerated,
      totalQrActivated,

      businessRevenue,
      showroomCommission: showroomTotal,
      salesCommission: salesTotal,

      netProfit,
      pendingRequests,

      topShowrooms,
      topSalesPersons

    });

  } catch (error) {

    console.log("Admin Dashboard Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});


router.get("/download-showroom-qr/:showroomId", async (req, res) => {

  try {

    const showroomId = req.params.showroomId;

    const qrs = await QrCode.find({
      showroom: showroomId
    }).limit(50); // batch size

    if (!qrs.length) {
      return res.status(404).json({
        message: "No QR codes found"
      });
    }

    const doc = new PDFDocument({ margin: 20 });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=qr-batch.pdf"
    );

    doc.pipe(res);

    let x = 50;
    let y = 50;

    for (let qr of qrs) {

      const publicUrl =
        `https://parkingqr-backend.onrender.com/scan/${qr.qrId}`;

      const qrImage = await QRCode.toDataURL(publicUrl);

      const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");

      const imgBuffer = Buffer.from(base64Data, "base64");

      doc.image(imgBuffer, x, y, { width: 120 });

      y += 150;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }

    }

    doc.end();

  } catch (error) {

    console.log("QR Download Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

module.exports = router;