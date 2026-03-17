const express = require("express");
const router = express.Router();
const Support = require("../models/Support");
const protect = require("../middleware/authMiddleware");


// ✅ Send message
router.post("/", protect, async (req,res)=>{

const { message } = req.body;

if(!message){
return res.status(400).json({message:"Message required"});
}

let support = await Support.findOne({
user: req.user.id,
status:"open"
});

if(!support){
support = await Support.create({
user:req.user.id,
messages:[{ text: message }]
});
}else{
support.messages.push({ text: message });
await support.save();
}

res.json(support);

});


// ✅ Get my messages
router.get("/my", protect, async (req,res)=>{

const support = await Support.findOne({
user:req.user.id,
status:"open"
});

res.json(support?.messages || []);

});

module.exports = router;