const User = require("../models/User");

exports.activateSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1 year validity
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    user.subscriptionActive = true;
    user.subscriptionExpiresAt = oneYearLater;

    await user.save()

    res.json({
      message: "Subscription activated",
      subscriptionActive: user.subscriptionActive,
      expiresAt: oneYearLater,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
