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
const CommissionWithdrawal = require("../models/CommissionWithdrawal");
const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const sendPushNotification = require("../utils/sendPushNotification");
const AdminNotification = require("../models/AdminNotification");
const EmployeeAccess = require("../models/EmployeeAccess");
const ShowroomClosureRequest = require("../models/ShowroomClosureRequest");
const QrOrder = require("../models/QrOrder");
const Support = require("../models/Support");
const { normalizeStateCode } = require("../utils/stateCodeMap");

const MOBILE_REGEX = /^[6-9]\d{9}$/;

function normalizeMobile(mobile) {
  return String(mobile || "").trim();
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeBrandList(brands = []) {
  const values = Array.isArray(brands) ? brands : [brands];
  const seen = new Set();

  return values
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function buildAdminAudienceFilter(audience) {
  const normalizedAudience = String(audience || "all_users").toLowerCase();

  if (normalizedAudience === "active_subscribers") {
    return {
      subscriptionActive: true,
      subscriptionExpiresAt: { $gte: new Date() },
    };
  }

  if (normalizedAudience === "inactive_users") {
    return {
      $or: [
        { subscriptionActive: false },
        { subscriptionExpiresAt: { $lt: new Date() } },
        { subscriptionExpiresAt: null },
      ],
    };
  }

  return {};
}

function getAudienceLabel(audience) {
  switch (audience) {
    case "active_subscribers":
      return "Active Subscribers";
    case "inactive_users":
      return "Inactive Users";
    case "all_users":
    default:
      return "All Users";
  }
}

function isValidMobile(mobile) {
  return MOBILE_REGEX.test(normalizeMobile(mobile));
}

function adminOrEmployee(req, res, next) {
  if (!req.user || !["admin", "employee"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin or employee access only" });
  }

  next();
}

router.get("/qr-requests", async (req, res) => {

  try {

    const requests = await QrRequest.find()
      .populate("showroom", "name showroomCode vehicleType phone contactPerson addressLine1 addressLine2 pincode city")
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

router.get("/dashboard", protect, adminOrEmployee, async (req, res) => {

  try {

    const pendingRequests = await QrRequest.countDocuments({
    status: "pending"
    });
    const pendingOrders = await QrOrder.countDocuments({
      status: "processing"
    });
    const pendingBusinessLeads = await ShowroomLead.countDocuments({
      status: "pending"
    });
    const openSupportTickets = await Support.countDocuments({
      status: "open"
    });
    const pendingClosureRequests = await ShowroomClosureRequest.countDocuments({
      status: "pending"
    });
    const pendingWithdrawals = await CommissionWithdrawal.countDocuments({
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

    const response = {
      totalUsers,
      totalShowrooms,
      totalQrGenerated,
      totalQrActivated,
      pendingRequests,
      pendingOrders,
      pendingBusinessLeads,
      openSupportTickets,
      pendingClosureRequests,
      pendingWithdrawals,
      topShowrooms,
      topSalesPersons,
    };

    if (req.user.role === "admin") {
      response.businessRevenue = businessRevenue;
      response.showroomCommission = showroomTotal;
      response.salesCommission = salesTotal;
      response.netProfit = netProfit;
    }

    res.json(response);

  } catch (error) {

    console.log("Admin Dashboard Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.get("/withdrawals", protect, adminOnly, async (req, res) => {
  try {
    const withdrawals = await CommissionWithdrawal.find()
      .populate("showroom", "name showroomCode")
      .populate("salesPerson", "name")
      .sort({ requestedAt: -1 });

    const response = withdrawals.map((withdrawal) => ({
      _id: withdrawal._id,
      entityType: withdrawal.entityType,
      monthKey: withdrawal.monthKey,
      requestedAmount: withdrawal.requestedAmount,
      totalActivations: withdrawal.totalActivations,
      status: withdrawal.status,
      requestNote: withdrawal.requestNote,
      paymentNote: withdrawal.paymentNote,
      transactionRef: withdrawal.transactionRef,
      requestedAt: withdrawal.requestedAt,
      paidAt: withdrawal.paidAt,
      rejectedAt: withdrawal.rejectedAt,
      payoutMode: withdrawal.payoutMode,
      payoutDetailsSnapshot: withdrawal.payoutDetailsSnapshot,
      showroom: withdrawal.showroom,
      salesPerson: withdrawal.salesPerson,
      title:
        withdrawal.entityType === "showroom"
          ? withdrawal.showroom?.name || "Showroom"
          : withdrawal.salesPerson?.name || "Salesperson",
      subtitle:
        withdrawal.entityType === "showroom"
          ? withdrawal.showroom?.showroomCode || ""
          : withdrawal.showroom?.name || "",
    }));

    res.json(response);
  } catch (error) {
    console.log("Admin withdrawal fetch error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/withdrawals/:id", protect, adminOnly, async (req, res) => {
  try {
    const { status, paymentNote = "", transactionRef = "" } = req.body;

    if (!["paid", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const withdrawal = await CommissionWithdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    withdrawal.status = status;
    withdrawal.paymentNote = paymentNote;
    withdrawal.transactionRef = transactionRef;

    if (status === "paid") {
      withdrawal.paidAt = new Date();
      withdrawal.rejectedAt = null;
    } else {
      withdrawal.rejectedAt = new Date();
      withdrawal.paidAt = null;
    }

    await withdrawal.save();

    res.json({
      message: `Withdrawal ${status}`,
      status: withdrawal.status,
    });
  } catch (error) {
    console.log("Admin withdrawal update error", error);
    res.status(500).json({ message: "Server error" });
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
        const qrImage = await QRCode.toDataURL(publicUrl, {
            margin: 1,   // 👈 border kam
            
          });
        const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
        const qrBuffer = Buffer.from(base64Data, "base64");

        for (let copy = 0; copy < 2; copy++) {

          // TEMPLATE (same as before)
          doc.image(templatePath, x, y - 56, {
            width: cardWidth,
          });

          // QR (same as before)
          const qrSize = 120;
          const qrX = x + (cardWidth - qrSize) / 2;
          const qrY = y + 20;

                    doc.image(qrBuffer, qrX, qrY, {
              width: qrSize,
            });

                        const shortQrId = String(qr.qrId || "").slice(-5);
            doc.save();
            doc
              .fontSize(6)
              .fillColor("#222222")
              .rotate(-90, { origin: [qrX - 12, qrY + qrSize / 2] })
              .text(shortQrId, qrX - qrSize / 2 - 6, qrY + qrSize / 2, {
                width: qrSize,
                align: "center",
              });
            doc.restore();

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

      const qrSize = 68;      // 👈 yaha change karna
      const qrOffsetY = 37;    // 👈 yaha change karna
      const templateOffsetY = 0; // 👈 yaha change karna

      for (let i = 0; i < qrs.length; i++) {
        const qr = qrs[i];

        const publicUrl = `https://parkingqr-backend.onrender.com/scan/${qr.qrId}`;
        const qrImage = await QRCode.toDataURL(publicUrl, {
            margin: 1,   // 👈 border kam
            width: 500   // 👈 better quality
          });
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

                        const shortQrId = String(qr.qrId || "").slice(-5);
            doc.save();
            doc
              .fontSize(5)
              .fillColor("#222222")
              .rotate(-90, { origin: [qrX - 10, qrY + qrSize / 2] })
              .text(shortQrId, qrX - qrSize / 2 - 4, qrY + qrSize / 2, {
                width: qrSize,
                align: "center",
              });
            doc.restore();

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

    const upperStateCode = normalizeStateCode(lead.stateCode);

    if (!upperStateCode) {
      return res.status(400).json({
        message: "Lead has invalid state value. Please update the lead state first.",
      });
    }

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
    const normalizedVehicleBrands = normalizeBrandList(lead.vehicleBrands);

    const showroom = await Showroom.create({

      name: lead.name,
      city: lead.city,
      stateCode: upperStateCode,
      showroomCode,

      contactPerson: lead.contactPerson,
      phone: lead.phone,
      addressLine1: lead.addressLine1,
      pincode: lead.pincode,

      username,
      password: hashedPassword,

      vehicleType: lead.vehicleType,   // 👈 🔥 MAIN FIX
      vehicleBrands: normalizedVehicleBrands,
      vehicleBrandKeys: normalizedVehicleBrands.map((item) => item.toLowerCase())

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

router.post("/notifications/send", protect, adminOnly, async (req, res) => {
  try {
    const { title, message, audience = "all_users" } = req.body;

    const normalizedTitle = String(title || "").trim();
    const normalizedMessage = String(message || "").trim();
    const normalizedAudience = String(audience || "all_users").trim().toLowerCase();

    if (!normalizedTitle || !normalizedMessage) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    if (
      !["all_users", "active_subscribers", "inactive_users"].includes(
        normalizedAudience
      )
    ) {
      return res.status(400).json({ message: "Invalid audience selected" });
    }

    const audienceFilter = buildAdminAudienceFilter(normalizedAudience);

    const users = await User.find({
      expoPushToken: { $ne: null },
      ...audienceFilter,
    }).select("_id expoPushToken mobile subscriptionActive subscriptionExpiresAt");

    const uniqueTokens = Array.from(
      new Set(
        users
          .map((user) => String(user.expoPushToken || "").trim())
          .filter(Boolean)
      )
    );

    const results = await Promise.allSettled(
      uniqueTokens.map((token) =>
        sendPushNotification(token, normalizedTitle, normalizedMessage, {
          type: "ADMIN_BROADCAST",
          audience: normalizedAudience,
        })
      )
    );

    const deliveredCount = results.filter(
      (item) => item.status === "fulfilled" && item.value?.ok
    ).length;
    const failedCount = uniqueTokens.length - deliveredCount;

    const notification = await AdminNotification.create({
      createdBy: req.user?._id || null,
      title: normalizedTitle,
      message: normalizedMessage,
      audience: normalizedAudience,
      recipientCount: uniqueTokens.length,
      deliveredCount,
      failedCount,
    });

    res.json({
      message: `Notification queued for ${uniqueTokens.length} users`,
      data: notification,
      recipientCount: uniqueTokens.length,
      deliveredCount,
      failedCount,
    });
  } catch (error) {
    console.log("Admin notification send error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/notifications/history", protect, adminOnly, async (req, res) => {
  try {
    const history = await AdminNotification.find()
      .populate("createdBy", "mobile")
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(history);
  } catch (error) {
    console.log("Admin notification history error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/employees", protect, adminOnly, async (req, res) => {
  try {
    const employees = await EmployeeAccess.find()
      .populate("addedBy", "mobile")
      .sort({ updatedAt: -1, createdAt: -1 });

    res.json(employees);
  } catch (error) {
    console.log("Employee access fetch error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/employees", protect, adminOnly, async (req, res) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "employee").trim().toLowerCase();

    if (!isValidMobile(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    if (role !== "employee") {
      return res.status(400).json({ message: "Invalid employee role selected" });
    }

    const existingUser = await User.findOne({ mobile });

    if (existingUser?.role === "admin") {
      return res
        .status(400)
        .json({ message: "Admin mobile cannot be added as employee" });
    }

    const employeeAccess = await EmployeeAccess.findOneAndUpdate(
      { mobile },
      {
        mobile,
        name,
        role,
        isActive: true,
        addedBy: req.user?._id || null,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).populate("addedBy", "mobile");

    if (existingUser && existingUser.role !== "employee") {
      existingUser.role = "employee";
      await existingUser.save();
    }

    res.json({
      message: "Employee access saved successfully",
      data: employeeAccess,
    });
  } catch (error) {
    console.log("Employee access save error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/employees/:id/status", protect, adminOnly, async (req, res) => {
  try {
    const isActive = Boolean(req.body?.isActive);

    const employeeAccess = await EmployeeAccess.findById(req.params.id);

    if (!employeeAccess) {
      return res.status(404).json({ message: "Employee access not found" });
    }

    employeeAccess.isActive = isActive;
    employeeAccess.addedBy = req.user?._id || employeeAccess.addedBy;
    await employeeAccess.save();

    const linkedUser = await User.findOne({ mobile: employeeAccess.mobile });

    if (linkedUser && linkedUser.role !== "admin") {
      linkedUser.role = isActive ? "employee" : "user";
      await linkedUser.save();
    }

    const populatedEmployeeAccess = await EmployeeAccess.findById(employeeAccess._id)
      .populate("addedBy", "mobile");

    res.json({
      message: isActive
        ? "Employee access activated successfully"
        : "Employee access deactivated successfully",
      data: populatedEmployeeAccess,
    });
  } catch (error) {
    console.log("Employee access status update error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showroom-closure-requests", protect, adminOnly, async (req, res) => {
  try {
    const requests = await ShowroomClosureRequest.find()
      .populate("showroom", "name showroomCode city phone contactPerson isActive")
      .populate("reviewedBy", "mobile")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(requests);
  } catch (error) {
    console.log("Showroom closure request fetch error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch(
  "/showroom-closure-requests/:id",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const status = String(req.body?.status || "").trim().toLowerCase();
      const reviewNote = String(req.body?.reviewNote || "").trim();

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const request = await ShowroomClosureRequest.findById(req.params.id);

      if (!request) {
        return res.status(404).json({ message: "Closure request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ message: "Request already reviewed" });
      }

      request.status = status;
      request.reviewNote = reviewNote;
      request.reviewedAt = new Date();
      request.reviewedBy = req.user?._id || null;
      await request.save();

      if (status === "approved") {
        await Showroom.findByIdAndUpdate(request.showroom, {
          isActive: false,
          expoPushToken: null,
        });
      }

      const updatedRequest = await ShowroomClosureRequest.findById(request._id)
        .populate("showroom", "name showroomCode city phone contactPerson isActive")
        .populate("reviewedBy", "mobile");

      res.json({
        message:
          status === "approved"
            ? "Showroom closure request approved"
            : "Showroom closure request rejected",
        data: updatedRequest,
      });
    } catch (error) {
      console.log("Showroom closure request update error", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;




