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

// latest ticket lao (open ya closed)
const support = await Support.findOne({
user:req.user.id
}).sort({createdAt:-1});

if(!support){
return res.json({ messages: [], status: "open" });
}

res.json({
messages: support.messages,
status: support.status
});

});

router.post("/new", protect, async (req,res)=>{
try{

// purane open ticket ko close karo (safety)
await Support.updateMany(
{ user:req.user.id, status:"open" },
{ status:"closed" }
);

// new blank ticket create
const support = await Support.create({
user:req.user.id,
messages:[]
});

res.json({
message:"New chat started",
support
});

}catch(err){
res.status(500).json({message:"Server error"});
}
});

module.exports = router;