const express = require("express");
const router = express.Router();
const { activateSubscription } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

router.put("/subscribe", protect, activateSubscription);

module.exports = router;
