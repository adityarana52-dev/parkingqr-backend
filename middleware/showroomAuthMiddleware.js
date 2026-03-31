const jwt = require("jsonwebtoken");
const Showroom = require("../models/Showroom");

const protectShowroom = async (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({ message: "Invalid token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.showroom = decoded;

     // 🔥 NEW (SAFE ADDITION)
    const showroom = await Showroom.findById(decoded.id);
    req.showroomData = showroom;

    next();

  } catch (error) {
    console.error("Showroom Auth Error:", error.message);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = protectShowroom;