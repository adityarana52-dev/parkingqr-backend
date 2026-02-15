const express = require("express");
const router = express.Router();
const { activateSubscription } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");


router.put("/subscribe", protect, activateSubscription);

router.get("/profile", protect, async (req, res) => {
  res.json({
    _id: req.user._id,
    mobile: req.user.mobile,
    subscriptionActive: req.user.subscriptionActive,
  });
});

module.exports = router;
