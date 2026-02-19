const express = require("express");
const router = express.Router();
const Showroom = require("../models/Showroom");
const QrCode = require("../models/QrCode");
const mongoose = require("mongoose");

// ✅ Create Showroom
router.post("/create", async (req, res) => {
  try {
    const { name, city, contactPerson, phone } = req.body;

    if (!name || !city) {
      return res.status(400).json({ message: "Name and city are required" });
    }

    const showroom = await Showroom.create({
      name,
      city,
      contactPerson,
      phone,
    });

    res.status(201).json(showroom);
  } catch (error) {
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


module.exports = router;
