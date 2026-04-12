const User = require("../models/User");
const EmployeeAccess = require("../models/EmployeeAccess");
const jwt = require("jsonwebtoken");
const DEFAULT_ADMIN_MOBILE = "9827082531";
const DEFAULT_REVIEW_ADMIN_MOBILE = "8827242738";

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,   // 🔥 add role here
    },
    process.env.JWT_SECRET
  );
};

exports.generateToken = generateToken;

function normalizeMobile(mobile) {
  return String(mobile || "").trim();
}

async function ensureUserRole(user) {
  const adminMobile =
    normalizeMobile(process.env.ADMIN_MOBILE) || DEFAULT_ADMIN_MOBILE;
  const reviewAdminMobile =
    normalizeMobile(process.env.REVIEW_ADMIN_MOBILE) ||
    DEFAULT_REVIEW_ADMIN_MOBILE;
  const normalizedMobile = normalizeMobile(user?.mobile);

  let targetRole = "user";

  if (
    normalizedMobile === adminMobile ||
    normalizedMobile === reviewAdminMobile
  ) {
    targetRole = "admin";
  } else {
    const employeeAccess = await EmployeeAccess.findOne({
      mobile: normalizedMobile,
      isActive: true,
    }).select("role");

    if (employeeAccess?.role === "employee") {
      targetRole = "employee";
    }
  }

  if (user.role !== targetRole) {
    user.role = targetRole;
    await user.save();
  }

  return user;
}

exports.ensureUserRole = ensureUserRole;

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

    user = await ensureUserRole(user);

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
