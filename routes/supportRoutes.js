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

// 🔍 open ticket dhundo
let support = await Support.findOne({
user: req.user.id,
status:"open"
});

if(!support){
  
  // 🆕 NEW ticket create
  support = await Support.create({
    user:req.user.id,
    messages:[
      { text: message, sender:"user" },
      {
        text:"✅ Your request has been received. Our team will contact you shortly.",
        sender:"admin"
      }
    ]
  });

}else{

  // 🧵 SAME chat continue
  support.messages.push(
    { text: message, sender:"user" },
    {
      text:"✅ We have received your message. Our team will respond soon.",
      sender:"admin"
    }
  );

  await support.save();
}

res.json(support);

});


// ✅ Get my messages
router.get("/my", protect, async (req,res)=>{

// 🔍 sirf open ticket lao
let support = await Support.findOne({
user:req.user.id,
status:"open"
});

// ❌ agar resolved hai → empty return
if(!support){
return res.json([]);
}

res.json(support.messages);

});

module.exports = router;