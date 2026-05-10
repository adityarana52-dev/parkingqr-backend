const jwt = require("jsonwebtoken");
const DriverPartner = require("../models/DriverPartner");

module.exports = async function protectDriver(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: "Driver token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded?.type !== "driver") {
      return res.status(401).json({ message: "Invalid driver token" });
    }

    const driver = await DriverPartner.findById(decoded.id);

    if (!driver) {
      return res.status(401).json({ message: "Driver not found" });
    }

    req.driver = driver;
    next();
  } catch (error) {
    console.log("Driver auth error:", error.message);
    res.status(401).json({ message: "Driver authentication failed" });
  }
};
