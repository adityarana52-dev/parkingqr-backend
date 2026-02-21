const User = require("../models/User");
const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,   // 🔥 add role here
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

exports.loginUser = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number required" });
    }

    let user = await User.findOne({ mobile });

    if (!user) {
      user = await User.create({ mobile });
    }

    res.json({
      _id: user._id,
      mobile: user.mobile,
      subscriptionActive: user.subscriptionActive,
      token: generateToken(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
