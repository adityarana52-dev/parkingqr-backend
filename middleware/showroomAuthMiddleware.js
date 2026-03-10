const jwt = require("jsonwebtoken");
const Showroom = require("../models/Showroom");

const protectShowroom = (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.showroom = decoded;

    next();

  } catch (error) {
    console.error("Showroom Auth Error:", error.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = protectShowroom;