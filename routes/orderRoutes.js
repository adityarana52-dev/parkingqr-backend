const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const QrOrder = require("../models/QrOrder");


 const QrCode = require("../models/QrCode");


// ✅ Place Order
router.post("/", protect, async (req, res) => {
  try {

    const { name, mobile, address, city, state, pincode, quantity } = req.body;

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
      quantity: quantity || 1

      
    });

    console.log("ORDER CREATED:", order._id);

    console.log("Searching direct QR...");

    // find available direct QR
const qr = await QrCode.findOne({
  sourceType: "direct",
  isAssigned: false
}).sort({ createdAt: 1 });

console.log("QR FOUND:", qr);

if (!qr) {
  console.log("NO DIRECT QR AVAILABLE");
} else {

  qr.isAssigned = true;
  qr.assignedTo = req.user._id;
  qr.orderId = order._id;
  qr.qrStatus = "assigned";

  await qr.save();

  order.qrId = qr.qrId;
  await order.save();

  console.log("QR ASSIGNED:", qr.qrId);

}

    // 🔹 save qrId in order
    if (qr) {
      order.qrId = qr.qrId;
      await order.save();
    }

    res.json({
      message: "Order placed successfully",
      order
    });

  } catch (error) {
    console.log("Order Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get All Orders (Admin)
router.get("/admin", async (req, res) => {

try{

const orders = await QrOrder.find()
.sort({createdAt:-1})
.populate("user","mobile");

res.json(orders);

}catch(error){

console.log("Admin orders error",error);

res.status(500).json({
message:"Server error"
});

}

});

module.exports = router;
