const express = require("express");
const router = express.Router();

const QrRequest = require("../models/QrRequest");
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const User = require("../models/User");
const SalesPerson = require("../models/SalesPerson");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const ShowroomLead = require("../models/ShowroomLead");
const path = require("path");



const StateCounter = require("../models/StateCounter");
const bcrypt = require("bcryptjs");

router.get("/qr-requests", async (req, res) => {

  try {

    const requests = await QrRequest.find()
      .populate("showroom", "name showroomCode phone contactPerson addressLine1 addressLine2 pincode city")
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
        showroom: request.showroom,
        requestId: request._id,   // ✅ ADD,
        vehicleType: request.vehicleType   // 👈 ADD
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
    const requestId = req.params.showroomId;

    const qrs = await QrCode.find({ requestId });

    if (!qrs.length) {
      return res.status(404).json({ message: "No QR found" });
    }

    const vehicleType = qrs[0]?.vehicleType || "car";

    console.log("PDF VEHICLE TYPE 👉", vehicleType);

    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=qr.pdf");

    doc.pipe(res);

    let x = 10;
    let y = 5;

    const gapX = 10;
    const gapY = 10;

    // =========================
    // 🚗 CAR LAYOUT (UNCHANGED)
    // =========================
    if (vehicleType === "car") {

      const templatePath = path.join(__dirname, "../assets/template.png");

      const cardWidth = 180;
      const cardHeight = 260;

      for (let i = 0; i < qrs.length; i++) {
        const qr = qrs[i];

        const publicUrl = `https://parkingqr-backend.onrender.com/scan/${qr.qrId}`;
        const qrImage = await QRCode.toDataURL(publicUrl);
        const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
        const qrBuffer = Buffer.from(base64Data, "base64");

        for (let copy = 0; copy < 2; copy++) {

          // TEMPLATE (same as before)
          doc.image(templatePath, x, y - 40, {
            width: cardWidth,
          });

          // QR (same as before)
          const qrSize = 125;
          const qrX = x + (cardWidth - qrSize) / 2;
          const qrY = y + 30;

          doc.image(qrBuffer, qrX, qrY, {
            width: qrSize,
          });

          // POSITION
          x += cardWidth + gapX;

          if ((copy + 1) % 2 === 0) {
            x = 10;
            y += cardHeight + gapY;
          }

          if (y + cardHeight > 842) {
            doc.addPage();
            x = 10;
            y = 5;
          }
        }
      }
    }

    // =========================
    // 🏍 BIKE / SCOOTY LAYOUT (SEPARATE)
    // =========================
    else {

      const templatePath = path.join(__dirname, "../assets/bike.png");

      const cardWidth = 170;   // 👈 yaha change karna
      const cardHeight = 240;  // 👈 yaha change karna

      const qrSize = 75;      // 👈 yaha change karna
      const qrOffsetY = 25;    // 👈 yaha change karna
      const templateOffsetY = 0; // 👈 yaha change karna

      for (let i = 0; i < qrs.length; i++) {
        const qr = qrs[i];

        const publicUrl = `https://parkingqr-backend.onrender.com/scan/${qr.qrId}`;
        const qrImage = await QRCode.toDataURL(publicUrl);
        const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
        const qrBuffer = Buffer.from(base64Data, "base64");

        for (let copy = 0; copy < 2; copy++) {

          // TEMPLATE (bike only)
          doc.image(templatePath, x, y + templateOffsetY, {
            width: cardWidth,
          });

          // QR (bike only)
          const qrX = x + (cardWidth - qrSize) / 2;
          const qrY = y + qrOffsetY;

          doc.image(qrBuffer, qrX, qrY, {
            width: qrSize,
          });

          // POSITION
          x += cardWidth + gapX;

          if ((copy + 1) % 2 === 0) {
            x = 10;
            y += cardHeight + gapY;
          }

          if (y + cardHeight > 842) {
            doc.addPage();
            x = 10;
            y = 5;
          }
        }
      }
    }

    doc.end();

  } catch (error) {
    console.log(error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error" });
    }
  }
});

// GET BUSINESS LEADS
router.get("/business-leads", async (req, res) => {

  try {

    const leads = await ShowroomLead.find()
      .sort({ createdAt: -1 });

    res.json(leads);

  } catch (error) {

    console.log("Fetch Leads Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});


router.post("/convert-lead/:id", async (req, res) => {

  try {

    const lead = await ShowroomLead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found"
      });
    }

    // generate showroom code
    const upperStateCode = lead.stateCode.toUpperCase();

    const counter = await StateCounter.findOneAndUpdate(
      { stateCode: upperStateCode },
      { $inc: { lastNumber: 1 } },
      { new: true, upsert: true }
    );

    const paddedNumber = counter.lastNumber
      .toString()
      .padStart(5, "0");

    const showroomCode = upperStateCode + paddedNumber;

    // auto credentials
    const username = lead.phone;

    const password = Math.random().toString(36).slice(-8);

    const hashedPassword = await bcrypt.hash(password, 10);

    const showroom = await Showroom.create({

      name: lead.name,
      city: lead.city,
      stateCode: lead.stateCode,
      showroomCode,

      contactPerson: lead.contactPerson,
      phone: lead.phone,
      addressLine1: lead.addressLine1,
      pincode: lead.pincode,

      username,
      password: hashedPassword,

      vehicleType: lead.vehicleType   // 👈 🔥 MAIN FIX

    });

    lead.status = "converted";
    await lead.save();

    res.json({
      message: "Lead converted successfully",
      showroomCode,
      username,
      password
    });

  } catch (error) {

    console.log("Convert Lead Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.patch("/reject-lead/:id", async (req,res)=>{

try{

await ShowroomLead.findByIdAndUpdate(
req.params.id,
{status:"rejected"}
);

res.json({
message:"Lead rejected"
});

}catch(error){

console.log("Reject Lead Error",error);

res.status(500).json({
message:"Server error"
});

}

});


// GET all support messages
router.get("/support", async (req,res)=>{
  const data = await Support.find()
.populate("user","mobile")
.populate("showroom","name showroomCode")
.sort({createdAt:-1});
  res.json(data);
});

// mark resolved
router.patch("/support/:id", async (req,res)=>{
  await Support.findByIdAndUpdate(req.params.id,{ status:"resolved" });
  res.json({message:"updated"});
});


const Support = require("../models/Support");

router.get("/support", async (req,res)=>{
try{

const data = await Support.find()
.populate("user","mobile")
.sort({createdAt:-1});

res.json(data);

}catch(err){
res.status(500).json({message:"Server error"});
}
});


router.patch("/support/reply/:id", async (req,res)=>{
try{

const { message } = req.body;

const support = await Support.findById(req.params.id);

support.messages.push({
text: message,
sender:"admin"
});

await support.save();

res.json({message:"Reply sent"});

}catch(err){
res.status(500).json({message:"Server error"});
}
});


router.patch("/support/close/:id", async (req,res)=>{
try{

const support = await Support.findById(req.params.id);

if(!support){
return res.status(404).json({message:"Ticket not found"});
}

// ✅ status update
support.status = "closed";

// ✅ user ko message bhejo
support.messages.push({
text:"✅ Your issue has been resolved. If you need further help, you can start a new conversation.",
sender:"admin"
});

await support.save();

res.json({message:"Ticket closed"});

}catch(err){
res.status(500).json({message:"Server error"});
}
});

module.exports = router;