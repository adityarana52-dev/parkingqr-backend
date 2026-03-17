const express = require("express");
const router = express.Router();
const Support = require("../models/Support");
const protect = require("../middleware/authMiddleware");


// ✅ Send message
router.post("/", protect, async (req,res)=>{
  try{

    const { message } = req.body;

    const support = await Support.create({
      user: req.user.id,
      message
    });

    res.json(support);

  }catch(err){
    res.status(500).json({message:"Server error"});
  }
});


// ✅ Get my messages
router.get("/my", protect, async (req,res)=>{
  try{

    const messages = await Support.find({
      user: req.user.id
    }).sort({ createdAt:-1 });

    res.json(messages);

  }catch(err){
    res.status(500).json({message:"Server error"});
  }
});

module.exports = router;