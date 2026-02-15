const User = require("../models/User");

exports.activateSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.subscriptionActive = true;
    await user.save();

    res.json({
      message: "Subscription activated",
      subscriptionActive: user.subscriptionActive,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
