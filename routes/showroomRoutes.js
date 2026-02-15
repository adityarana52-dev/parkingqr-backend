const express = require("express");
const router = express.Router();
const Showroom = require("../models/Showroom");

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

module.exports = router;
