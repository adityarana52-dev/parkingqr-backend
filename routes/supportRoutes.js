const express = require("express");
const router = express.Router();

const Support = require("../models/Support");
const protect = require("../middleware/authMiddleware");


// ✅ SEND MESSAGE
router.post("/", protect, async (req, res) => {
  try {

    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    // 👇 detect sender type
    const senderType =
      req.user.role === "showroom" ? "showroom" : "user";

    // 🔍 find existing open ticket
    let support = await Support.findOne({
      $or: [
        { user: req.user.id },
        { showroom: req.user.id }
      ],
      status: "open"
    });

    // 🆕 NEW ticket
    if (!support) {

      support = await Support.create({

        user: req.user.role === "user" ? req.user.id : null,

        showroom:
          req.user.role === "showroom" ? req.user.id : null,

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

      // 🧵 EXISTING chat continue
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

    res.json(support);

  } catch (error) {
    console.log("Support Send Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ GET MY CHAT
router.get("/my", protect, async (req, res) => {
  try {

    const support = await Support.findOne({
      $or: [
        { user: req.user.id },
        { showroom: req.user.id }
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
router.post("/new", protect, async (req, res) => {
  try {

    // close old tickets
    await Support.updateMany(
      {
        $or: [
          { user: req.user.id },
          { showroom: req.user.id }
        ],
        status: "open"
      },
      { status: "closed" }
    );

    // create new empty ticket
    const support = await Support.create({

      user: req.user.role === "user" ? req.user.id : null,

      showroom:
        req.user.role === "showroom" ? req.user.id : null,

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