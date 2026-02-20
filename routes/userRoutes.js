const express = require("express");
const router = express.Router();
const { activateSubscription } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const User = require("../models/User");

router.put("/subscribe", protect, activateSubscription);

router.get("/profile", protect, async (req, res) => {
  res.json({
    _id: req.user._id,
    mobile: req.user.mobile,
    subscriptionActive: req.user.subscriptionActive,
    subscriptionExpiresAt: req.user.subscriptionExpiresAt,
  });
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

module.exports = router;
