const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const QrOrder = require("../models/QrOrder");
const assignDirectQr = require("../utils/assignDirectQr");


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
      quantity: quantity || 1
    });

    const QrCode = require("../models/QrCode");

      const qr = await QrCode.findOneAndUpdate(
      {
      sourceType: "direct",
      isAssigned: false
      },
      {
      isAssigned: true,
      assignedTo: req.user._id,
      orderId: order._id,
      qrStatus: "assigned"
      },
      { new: true }
      );


    await assignDirectQr(order._id, userId, quantity);

    res.json({
      message: "Order placed successfully",
      order,
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
