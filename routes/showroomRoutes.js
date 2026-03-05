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

    const showroomId = req.showroom._id;

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

    const showroomId = req.showroom._id;

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
      showroom: req.showroom._id,
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
      showroom: req.showroom._id
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

module.exports = router;
