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
        requestId: request._id   // ✅ ADD
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


    const path = require("path");
    const requestId = req.params.showroomId;

    console.log("REQ ID 👉", req.params.showroomId);

      const qrs = await QrCode.find({
        requestId: requestId
      });

      console.log("QR COUNT 👉", qrs.length);
    console.log("QR requestIds 👉", qrs.map(q => q.requestId));

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

      // Light card background
doc.rect(x, y, 170, 220).fill("#F5F5F5");

// QR LEFT SIDE
const qrSize = 90;

doc.rect(x + 10, y + 25, qrSize, qrSize).fill("#FFFFFF");

doc.image(imgBuffer, x + 15, y + 30, {
  width: qrSize - 10,
});

// RIGHT SIDE TEXT
doc
  .fillColor("#000")
  .fontSize(10)
  .font("Helvetica-Bold")
  .text("Move Vehicle Request", x + 105, y + 40);

doc
  .fontSize(10)
  .text("Towing your vehicle", x + 105, y + 60);

doc
  .text("Contact Owner Directly", x + 105, y + 80);

// Bottom divider
doc.moveTo(x + 10, y + 130)
  .lineTo(x + 160, y + 130)
  .stroke("#ccc");

// Footer text
doc
  .fontSize(8)
  .fillColor("#555")
  .text("Scan to contact vehicle owner", x, y + 140, {
    width: 170,
    align: "center"
  });

// Powered by
doc
  .fontSize(7)
  .fillColor("#999")
  .text("Powered by ParkingQR", x, y + 190, {
    width: 170,
    align: "center"
  });

  const carPath = path.join(__dirname, "../assets/car.png");

doc.image(carPath, x + 10, y + 150, {
  width: 150,
});
        // 👉 next QR position
        x += 190;

        if (x > 400) {
          x = 50;
          y += 240;
        }

        if (y > 700) {
          doc.addPage();
          x = 50;
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
      password: hashedPassword

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