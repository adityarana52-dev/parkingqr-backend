const jwt = require("jsonwebtoken");
const Showroom = require("../models/Showroom");

const protectShowroom = async (req, res, next) => {
  try {

    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "No token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.showroom = await Showroom.findById(decoded.id);

    next();
  } catch (error) {
    console.log("Showroom Auth Error:", error);
    res.status(401).json({ message: "Token failed" });
  }
};

module.exports = protectShowroom;