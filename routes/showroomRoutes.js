const express = require("express");
const router = express.Router();
const Showroom = require("../models/Showroom");
const SalesPerson = require("../models/SalesPerson");
const QrCode = require("../models/QrCode");
const mongoose = require("mongoose");
const StateCounter = require("../models/StateCounter");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const QrRequest = require("../models/QrRequest");
const sendPushNotification = require("../utils/sendPushNotification");
const ShowroomNotification = require("../models/ShowroomNotification");
const User = require("../models/User");

const ReminderLog = require("../models/ReminderLog");

// ✅ Create Showroom
// ✅ Create Showroom (State Wise Auto Code)
router.post("/create", async (req, res) => {
  try {

    const { name, city, stateCode, contactPerson, phone, username, password } = req.body;

    if (!name || !city || !stateCode || !username || !password) {
      return res.status(400).json({
        message: "Name, city, stateCode, username and password required"
      });
    }

    const upperStateCode = stateCode.toUpperCase();

    // 🔥 Generate showroomCode using StateCounter
    const counter = await StateCounter.findOneAndUpdate(
      { stateCode: upperStateCode },
      { $inc: { lastNumber: 1 } },
      { new: true, upsert: true }
    );

    const paddedNumber = counter.lastNumber
      .toString()
      .padStart(5, "0");

    const showroomCode = upperStateCode + paddedNumber;

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const showroom = await Showroom.create({
      name,
      city,
      stateCode: upperStateCode,
      showroomCode,
      contactPerson,
      phone,
      username,
      password: hashedPassword
    });

    res.status(201).json(showroom);

  } catch (error) {

    console.log("Create Showroom Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

// ✅ Get All Showrooms
router.get("/", async (req, res) => {
  try {
    const showrooms = await Showroom.find().sort({ createdAt: -1 });
    res.json(showrooms);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Showroom Analytics (Allocated vs Activated QR)
router.get("/analytics", async (req, res) => {
  try {
    const showrooms = await Showroom.find();

    const data = [];

    for (let showroom of showrooms) {
      const totalAllocated = await QrCode.countDocuments({
        showroom: showroom._id,
      });

      const totalActivated = await QrCode.countDocuments({
        showroom: showroom._id,
        isAssigned: true,
      });

      data.push({
        showroomName: showroom.name,
        city: showroom.city,
        totalAllocated,
        totalActivated,
      });
    }

    res.json(data);

  } catch (error) {
    console.log("Showroom Analytics Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Salesperson Analytics
router.get("/sales-analytics/:showroomId", async (req, res) => {
  try {
    const { showroomId } = req.params;

    const result = await QrCode.aggregate([
      {
        $match: {
          showroom: new mongoose.Types.ObjectId(showroomId),
          isAssigned: true,
        },
      },
      {
        $group: {
          _id: "$salesPerson",
          totalActivated: { $sum: 1 },
        },
      },
      {
        $sort: { totalActivated: -1 },
      },
    ]);

    res.json(result);

  } catch (error) {
    console.log("Sales Analytics Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Showroom Dashboard
router.get("/dashboard", protectShowroom, async (req, res) => {
  try {

    const showroomId = req.showroom.id;

    const showroom = await Showroom.findById(showroomId);

    if (!showroom) {
      return res.status(404).json({
        message: "Showroom not found"
      });
    }

    // Remaining stock
    const remainingStock =
      showroom.totalQRAllotted - showroom.totalQRActivated;

    // SalesPerson stats
    const salesPersons = await SalesPerson.find({
      showroom: showroomId
    }).select("name totalActivations totalEarnings");

    res.json({

      showroomName: showroom.name,
      showroomCode: showroom.showroomCode,
      city: showroom.city,

      isActive: showroom.isActive,

      totalAllotted: showroom.totalQRAllotted,
      totalActivated: showroom.totalQRActivated,
      remainingStock,

      totalEarnings: showroom.totalEarnings,

      salesPersons

    });

  } catch (error) {

    console.log("Showroom Dashboard Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

router.post("/login", async (req, res) => {

  try {

    const { username, password } = req.body;

    const showroom = await Showroom.findOne({ username });

    if (!showroom) {
      return res.status(400).json({
        message: "Invalid username or password"
      });
    }

    const isMatch = await bcrypt.compare(password, showroom.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid username or password"
      });
    }

    const token = jwt.sign(
      { id: showroom._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      showroomId: showroom._id,
      showroomCode: showroom.showroomCode
    });

  } catch (error) {

    console.log("Showroom Login Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});


router.get("/qr-stock", protectShowroom, async (req, res) => {

  try {

    const showroomId = req.showroom.id;

    const totalAllocated = await QrCode.countDocuments({
      showroom: showroomId
    });

    const totalActivated = await QrCode.countDocuments({
      showroom: showroomId,
      isAssigned: true
    });

    const remaining = totalAllocated - totalActivated;

    res.json({
      showroomCode: req.showroom.showroomCode,
      totalAllocated,
      totalActivated,
      remaining
    });

  } catch (error) {

    console.log("QR Stock Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.post("/request-qr", protectShowroom, async (req, res) => {

  try {

    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        message: "Quantity required"
      });
    }

    const request = await QrRequest.create({
      showroom: req.showroom.id,
      quantity
    });

    res.status(201).json({
      message: "QR request submitted",
      request
    });

  } catch (error) {

    console.log("QR Request Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

//for show qr requirement history
router.get("/qr-requests", protectShowroom, async (req, res) => {

  try {

    const requests = await QrRequest.find({
      showroom: req.showroom.id
    })
    .sort({ createdAt: -1 });

    res.json(requests);

  } catch (error) {

    console.log("QR Request History Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

//Send offer
router.post("/send-offer", protectShowroom, async (req,res)=>{

try{

const {message} = req.body;

if(!message){
return res.status(400).json({
message:"Message required"
});
}

const showroomId = req.showroom.id;

const now = new Date();
const month = now.getMonth();
const year = now.getFullYear();


// check monthly limit
const count = await ShowroomNotification.countDocuments({
showroom:showroomId,
month,
year
});

if(count >= 2){
return res.status(400).json({
message:"Monthly limit reached (2 notifications)"
});
}


// find showroom users
const qrs = await QrCode.find({
showroom:showroomId,
isAssigned:true
}).populate("assignedTo");


// filter users with token
const users = qrs.filter(qr => qr.assignedTo?.expoPushToken);


// send push notifications (FAST)
await Promise.all(

users.map(qr =>
sendPushNotification(
qr.assignedTo.expoPushToken,
"🏪 Showroom Offer",
message,
{type:"offer"}
)
)

);


// save notification record
await ShowroomNotification.create({
showroom:showroomId,
message,
month,
year
});


// save offer history (only once)
await OfferLog.create({
showroomId:showroomId,
message:message
});


res.json({
message:"Offer notification sent",
totalUsers:users.length
});


}catch(error){

console.log("Send offer error",error);

res.status(500).json({
message:"Server error"
});

}

});


//offer to send message from showroom
router.get("/offer-count", protectShowroom, async (req,res)=>{

try{

const now = new Date();

const count = await ShowroomNotification.countDocuments({
showroom:req.showroom.id,
month:now.getMonth(),
year:now.getFullYear()
});

res.json({count});

}catch(error){

res.status(500).json({message:"Error"});

}

});

// ============================
// Insurance Due Vehicles
// ============================

router.get("/insurance-due", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const today = new Date();

// 7 days past
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

// 30 days future
const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const vehicles = await QrCode.find({
showroom: showroomId,
insuranceExpiryDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ insuranceExpiryDate: 1 });

res.json(vehicles);

}catch(error){

console.log("Insurance due error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Service Due Vehicles
// ============================

router.get("/service-due", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const today = new Date();

// 7 days past
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

// 30 days future
const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const vehicles = await QrCode.find({
showroom: showroomId,
nextServiceDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ nextServiceDate: 1 });

res.json(vehicles);

}catch(error){

console.log("Service due error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Send Insurance Reminder
// ============================

router.post("/send-insurance-reminder", protectShowroom, async (req,res)=>{

try{




const { message = "" } = req.body;

const showroomId = req.showroom.id;


const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

const todayReminderCount = await ReminderLog.countDocuments({
showroomId:req.showroom.id,
type:"insurance",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

if(todayReminderCount >= 2){
return res.status(400).json({
message:"Daily reminder limit reached (2 per day)"
});
}

const today = new Date();

// limits
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const qrs = await QrCode.find({
showroom: showroomId,
insuranceExpiryDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ insuranceExpiryDate: 1 });

let count = 0;

for(const qr of qrs){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"} Insurance Reminder`,

message || `Insurance for vehicle ${qr.vehicleNumber} is expiring soon. Please visit ${qr.showroom?.name || "our showroom"} for renewal.`,

{ type: "insurance-reminder" }

);

count++;

}

}

// save log
await ReminderLog.create({
showroomId:showroomId,
type:"insurance",
message:message
});

res.json({
message:"Insurance reminders sent",
total:count
});

}catch(error){

console.log("Send insurance reminder error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Send Service Reminder
// ============================

router.post("/send-service-reminder", protectShowroom, async (req,res)=>{

try{

const { message = "" } = req.body;

const showroomId = req.showroom.id;

const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

// check today reminders
const todayReminderCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"service",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

if(todayReminderCount >= 2){

return res.status(400).json({
message:"Daily service reminder limit reached (2 per day)"
});

}

const today = new Date();

// limits
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const qrs = await QrCode.find({
showroom: showroomId,
nextServiceDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ nextServiceDate: 1 });

let count = 0;

for(const qr of qrs){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"} Service Reminder`,

message || `Vehicle ${qr.vehicleNumber} service is due. Please visit ${qr.showroom?.name || "our showroom"} for service.`,

{ type: "service-reminder" }

);

count++;

}

}

// save log
await ReminderLog.create({
showroomId:showroomId,
type:"service",
message:message
});


res.json({
message:"Service reminders sent",
total:count
});

}catch(error){

console.log("Send service reminder error",error);

res.status(500).json({message:"Server error"});

}

});



// ============================
// Get Today Reminder Count
// ============================

router.get("/reminder-count", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

const insuranceCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"insurance",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

const serviceCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"service",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

res.json({
insurance:insuranceCount,
service:serviceCount
});

}catch(error){

console.log("Reminder count error",error);

res.status(500).json({message:"Server error"});

}

});

//showroom offer history check 
router.get("/offer-history", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0,0,0,0);

const offers = await OfferLog.find({
showroomId:showroomId,
createdAt:{ $gte:startOfMonth }
})
.sort({createdAt:-1})
.limit(5);

res.json(offers);

}catch(error){

console.log("Offer history error",error);

res.status(500).json({message:"Server error"});

}

});

module.exports = router;
