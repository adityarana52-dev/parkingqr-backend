const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const QrOrder = require("../models/QrOrder");


// ✅ Place Order
router.post("/", protect, async (req, res) => {
  try {
    const { name, mobile, address, city, state, pincode } = req.body;

    if (!name || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({ message: "All fields required" });
    }

    const order = await QrOrder.create({
      user: req.user._id,
      name,
      mobile,
      address,
      city,
      state,
      pincode,
    });

    res.json({
      message: "Order placed successfully",
      order,
    });

  } catch (error) {
    console.log("Order Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
