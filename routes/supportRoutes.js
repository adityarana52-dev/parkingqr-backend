const express = require("express");
const router = express.Router();
const Support = require("../models/Support");
const protect = require("../middleware/authMiddleware");
const protectShowroom = require("../middleware/showroomAuthMiddleware");


// ✅ Send message
router.post("/", async (req,res)=>{

const { message } = req.body;

if(!message){
return res.status(400).json({message:"Message required"});
}

      // 🔐 token detect (user ya showroom)
      let userId = null;
      let showroomId = null;

      try {
        await protect(req, res, () => {});
        userId = req.user?.id;
      } catch {}

      try {
        await protectShowroom(req, res, () => {});
        showroomId = req.showroom?.id;
      } catch {}

      // ❌ agar dono null → unauthorized
      if (!userId && !showroomId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 🔍 query decide
      let query = userId
        ? { user: userId, status: "open" }
        : { showroom: showroomId, status: "open" };

      // 🔍 find ticket
      let support = await Support.findOne(query);

      // 🆕 create new
      if (!support) {

        support = await Support.create({
          user: userId || null,
          showroom: showroomId || null,
          messages: [
            { text: message, sender: "user" },
            {
              text: "✅ Your request has been received. Our team will contact you shortly.",
              sender: "admin"
            }
          ]
        });

      } else {

        support.messages.push(
          { text: message, sender: "user" }
        );

        await support.save();
      }

      res.json(support);

});


// ✅ Get my messages
router.get("/my", async (req,res)=>{

// latest ticket lao (open ya closed)
let userId = null;
let showroomId = null;

try {
  await protect(req, res, () => {});
  userId = req.user?.id;
} catch {}

try {
  await protectShowroom(req, res, () => {});
  showroomId = req.showroom?.id;
} catch {}

let query = userId
  ? { user: userId }
  : { showroom: showroomId };

const support = await Support.findOne(query).sort({createdAt:-1});

if(!support){
return res.json({ messages: [], status: "open" });
}

res.json({
messages: support.messages,
status: support.status
});

});

router.post("/new", async (req,res)=>{
try{

      let userId = null;
      let showroomId = null;

      try {
        await protect(req, res, () => {});
        userId = req.user?.id;
      } catch {}

      try {
        await protectShowroom(req, res, () => {});
        showroomId = req.showroom?.id;
      } catch {}

      let query = userId
        ? { user: userId, status:"open" }
        : { showroom: showroomId, status:"open" };

      // old close
      await Support.updateMany(query, { status:"closed" });

      // new create
      const support = await Support.create({
      user: userId || null,
      showroom: showroomId || null,
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