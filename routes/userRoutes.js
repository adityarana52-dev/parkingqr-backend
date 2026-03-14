const express = require("express");
const router = express.Router();
const { activateSubscription } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const User = require("../models/User");
const sendPushNotification = require("../utils/sendPushNotification");
const OfferLog = require("../models/OfferLog");
const Showroom = require("../models/Showroom");
const QrCode = require("../models/QrCode");
const authMiddleware = require("../middleware/authMiddleware");

router.put("/subscribe", protect, activateSubscription);

router.get("/profile", protect, async (req, res) => {
  res.json({
    _id: req.user._id,
    mobile: req.user.mobile,
     role: req.user.role,
    subscriptionActive: req.user.subscriptionActive,
    subscriptionExpiresAt: req.user.subscriptionExpiresAt,
  });
});

// ✅ Update Mobile Number
router.put("/update-mobile", protect, async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || mobile.length < 10) {
      return res.status(400).json({ message: "Valid mobile required" });
    }

    // Check duplicate
    const existing = await User.findOne({ mobile });
    if (existing && existing._id.toString() !== req.user._id.toString()) {
      return res.status(400).json({ message: "Mobile already in use" });
    }

    req.user.mobile = mobile;
    await req.user.save();

    res.json({
      message: "Mobile updated successfully",
      mobile: req.user.mobile,
    });
  } catch (error) {
    console.log("Update Mobile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Save Expo Push Token
router.put("/save-push-token", protect, async (req, res) => {
  try {
    const { pushToken } = req.body;

    req.user.expoPushToken = pushToken;
    await req.user.save();

    res.json({ message: "Push token saved" });

  } catch (error) {
    console.log("Push Token Save Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//Renew
  router.put("/renew", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    user.subscriptionActive = true;
    user.subscriptionExpiresAt = oneYearLater;

    await user.save();

    res.json({
      message: "Subscription renewed successfully",
      expiresAt: oneYearLater,
    });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


// 🔔 EXPIRY REMINDER CHECK (ADMIN ONLY)
router.get("/expiring-soon", protect, async (req, res) => {
  try {
    const today = new Date();

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const oneDayLater = new Date();
    oneDayLater.setDate(today.getDate() + 1);

    const expiringSoon = await User.find({
      subscriptionActive: true,
      subscriptionExpiresAt: {
        $gte: today,
        $lte: sevenDaysLater,
      },
    });

    const expiringTomorrow = await User.find({
      subscriptionActive: true,
      subscriptionExpiresAt: {
        $gte: today,
        $lte: oneDayLater,
      },
    });

    const expiredUsers = await User.find({
      subscriptionActive: true,
      subscriptionExpiresAt: { $lt: today },
    });

    res.json({
      expiringSoonCount: expiringSoon.length,
      expiringTomorrowCount: expiringTomorrow.length,
      expiredCount: expiredUsers.length,
    });

  } catch (error) {
    console.log("Expiry check error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// 🔔 SEND EXPIRY REMINDERS (ADMIN ONLY)
router.post("/send-expiry-reminders", protect, async (req, res) => {
  try {
    const today = new Date();

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const users = await User.find({
      subscriptionActive: true,
      subscriptionExpiresAt: {
        $gte: today,
        $lte: sevenDaysLater,
      },
      expoPushToken: { $ne: null },
    });

    for (const user of users) {
      await sendPushNotification(
        user.expoPushToken,
        "Subscription Expiring Soon",
        "Your subscription will expire in less than 7 days. Please renew."
      );
    }

    res.json({ message: `Reminders sent to ${users.length} users` });

  } catch (error) {
    console.log("Reminder error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete account
router.delete("/delete", protect, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


//User offer feed API
router.get("/offers-feed", authMiddleware, async (req,res)=>{

try{

const userId = req.user.id;


// user data
const user = await User.findById(userId);

if(!user?.city){
return res.json([]);
}


// last 30 days
const last30Days = new Date();
last30Days.setDate(last30Days.getDate() - 30);


// city showrooms
const showrooms = await Showroom.find({
city: new RegExp("^"+user.city+"$", "i")
});

const showroomIds = showrooms.map(s => s._id);


// user showroom (if activated)
const userQr = await QrCode.findOne({
assignedTo:userId
});

const userShowroomId = userQr?.showroom || null;


// offers
let offers = await OfferLog.find({
showroomId:{$in:showroomIds},
createdAt:{$gte:last30Days}
})
.populate("showroomId","name city");


// sort (user showroom first)
offers = offers.sort((a,b)=>{

if(a.showroomId?._id?.toString() === userShowroomId?.toString()){
return -1;
}

if(b.showroomId?._id?.toString() === userShowroomId?.toString()){
return 1;
}

return new Date(b.createdAt) - new Date(a.createdAt);

});


res.json(offers);

}catch(error){

console.log("Offers feed error",error);

res.status(500).json({
message:"Server error"
});

}

});

module.exports = router;
