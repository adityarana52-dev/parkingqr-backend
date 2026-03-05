const express = require("express");
const router = express.Router();
const Showroom = require("../models/Showroom");
const SalesPerson = require("../models/SalesPerson");
const QrCode = require("../models/QrCode");
const mongoose = require("mongoose");
const StateCounter = require("../models/StateCounter");

// ✅ Create Showroom
// ✅ Create Showroom (State Wise Auto Code)
router.post("/create", async (req, res) => {
  try {
    const { name, city, stateCode, contactPerson, phone } = req.body;

    if (!name || !city || !stateCode) {
      return res.status(400).json({ 
        message: "Name, city and stateCode are required" 
      });
    }

    const upperStateCode = stateCode.toUpperCase();

    // 🔥 Atomic Increment (Concurrency Safe)
    const counter = await StateCounter.findOneAndUpdate(
      { stateCode: upperStateCode },
      { $inc: { lastNumber: 1 } },
      { new: true, upsert: true }
    );

    const paddedNumber = counter.lastNumber
      .toString()
      .padStart(5, "0");

    const showroomCode = upperStateCode + paddedNumber;

    const showroom = await Showroom.create({
      name,
      city,
      stateCode: upperStateCode,
      showroomCode,
      contactPerson,
      phone,
    });

    res.status(201).json(showroom);

  } catch (error) {
    console.error("Create Showroom Error:", error);
    res.status(500).json({ message: "Server error", error });
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
router.get("/dashboard/:showroomId", async (req, res) => {
  try {

    const { showroomId } = req.params;

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
module.exports = router;
