const express = require("express");
const router = express.Router();

const Support = require("../models/Support");
const protect = require("../middleware/authMiddleware");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const notifyAdmins = require("../utils/notifyAdmins");


// ✅ SEND MESSAGE
router.post("/", async (req, res) => {
  try {

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    let userId = null;
    let showroomId = null;
    let senderType = "user";

    // 🔍 try user auth
    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.user) {
        userId = req.user.id;
        senderType = "user";
      }

    } catch {}

    // 🔍 try showroom auth
    try {
      await new Promise((resolve, reject) => {
        protectShowroom(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.showroom) {
        showroomId = req.showroom.id;
        senderType = "showroom";
      }

    } catch {}

    // ❌ no auth
    if (!userId && !showroomId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔍 find existing ticket
    let support = await Support.findOne({
      $or: [
        { user: userId },
        { showroom: showroomId }
      ],
      status: "open"
    });

    // 🆕 NEW ticket
    if (!support) {

      support = await Support.create({
        user: userId || null,
        showroom: showroomId || null,
        messages: [
          {
            text: message,
            sender: senderType
          },
          {
            text:
              "✅ Your request has been received. Our team will contact you shortly.",
            sender: "admin"
          }
        ]
      });

    } else {

      support.messages.push(
        {
          text: message,
          sender: senderType
        },
        {
          text:
            "✅ We have received your message. Our team will respond soon.",
          sender: "admin"
        }
      );

      await support.save();
    }

    await notifyAdmins(
      "New Support Message",
      senderType === "showroom"
        ? "A showroom has sent a new support message."
        : "A user has sent a new support message.",
      {
        category: "support",
        supportId: support._id.toString(),
      }
    );

    res.json(support);

  } catch (error) {
    console.log("Support Send Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ GET MY CHAT
router.get("/my", async (req, res) => {
  try {

    let userId = null;
    let showroomId = null;

    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.user) userId = req.user.id;

    } catch {}

    try {
      await new Promise((resolve, reject) => {
        protectShowroom(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.showroom) showroomId = req.showroom.id;

    } catch {}

    if (!userId && !showroomId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const support = await Support.findOne({
      $or: [
        { user: userId },
        { showroom: showroomId }
      ]
    }).sort({ createdAt: -1 });

    if (!support) {
      return res.json({
        messages: [],
        status: "open"
      });
    }

    res.json({
      messages: support.messages,
      status: support.status
    });

  } catch (error) {
    console.log("Support Fetch Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ START NEW CHAT
router.post("/new", async (req, res) => {
  try {

    let userId = null;
    let showroomId = null;

    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.user) userId = req.user.id;

    } catch {}

    try {
      await new Promise((resolve, reject) => {
        protectShowroom(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      if (req.showroom) showroomId = req.showroom.id;

    } catch {}

    if (!userId && !showroomId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // close old
    await Support.updateMany(
      {
        $or: [
          { user: userId },
          { showroom: showroomId }
        ],
        status: "open"
      },
      { status: "closed" }
    );

    // new
    const support = await Support.create({
      user: userId || null,
      showroom: showroomId || null,
      messages: []
    });

    res.json({
      message: "New chat started",
      support
    });

  } catch (error) {
    console.log("New Chat Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
