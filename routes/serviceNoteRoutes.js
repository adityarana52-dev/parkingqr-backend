const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const ServiceNote = require("../models/ServiceNote");

function normalizeIssues(issues = []) {
  if (!Array.isArray(issues)) {
    return [];
  }

  const cleaned = issues
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item.text === "string") {
        return item.text.trim();
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 12);

  return cleaned.map((text) => ({ text }));
}

async function findOwnedQr(qrId, userId) {
  return QrCode.findOne({
    qrId,
    assignedTo: userId,
    qrStatus: "activated",
  });
}

function getShowroomSortKey(showroom) {
  return String(showroom?.showroomCode || showroom?.name || "").toUpperCase();
}

router.get("/my/:qrId", protect, async (req, res) => {
  try {
    const { qrId } = req.params;

    const qr = await findOwnedQr(qrId, req.user._id);
    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const activeNote = await ServiceNote.findOne({
      user: req.user._id,
      qrId,
      status: { $in: ["draft", "submitted", "in_service"] },
    })
      .populate("activatedShowroom", "name showroomCode city")
      .populate("selectedShowroom", "name showroomCode city")
      .sort({ updatedAt: -1 });

    const recentNotes = await ServiceNote.find({
      user: req.user._id,
      qrId,
      status: "archived",
    })
      .populate("selectedShowroom", "name showroomCode city")
      .sort({ archivedAt: -1, updatedAt: -1 })
      .limit(5);

    res.json({
      activeNote,
      recentNotes,
    });
  } catch (error) {
    console.log("Get service notes error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showrooms/:qrId", protect, async (req, res) => {
  try {
    const { qrId } = req.params;
    const qr = await findOwnedQr(qrId, req.user._id).populate(
      "showroom",
      "name showroomCode city vehicleType"
    );

    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const showroomFilter = { isActive: true };
    if (qr.vehicleType) {
      showroomFilter.$or = [
        { vehicleType: qr.vehicleType },
        { vehicleType: null },
        { vehicleType: { $exists: false } },
      ];
    }

    const showrooms = await Showroom.find(showroomFilter)
      .select("name showroomCode city vehicleType")
      .lean();

    const activatedShowroomId = qr.showroom?._id?.toString() || null;

    const sortedShowrooms = showrooms
      .map((showroom) => ({
        ...showroom,
        isActivatedShowroom:
          activatedShowroomId &&
          showroom._id.toString() === activatedShowroomId,
      }))
      .sort((a, b) => {
        if (a.isActivatedShowroom && !b.isActivatedShowroom) return -1;
        if (b.isActivatedShowroom && !a.isActivatedShowroom) return 1;
        return getShowroomSortKey(a).localeCompare(getShowroomSortKey(b));
      });

    res.json({
      activatedShowroomId,
      showrooms: sortedShowrooms,
    });
  } catch (error) {
    console.log("Get service note showrooms error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/draft", protect, async (req, res) => {
  try {
    const { qrId, issues } = req.body;

    if (!qrId) {
      return res.status(400).json({ message: "QR ID required" });
    }

    const qr = await findOwnedQr(qrId, req.user._id);
    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const normalizedIssues = normalizeIssues(issues);

    const existingActiveNote = await ServiceNote.findOne({
      user: req.user._id,
      qrId,
      status: { $in: ["draft", "submitted", "in_service"] },
    }).sort({ updatedAt: -1 });

    if (
      existingActiveNote &&
      existingActiveNote.status &&
      existingActiveNote.status !== "draft"
    ) {
      return res.status(409).json({
        message:
          "A service request is already submitted for this vehicle. Complete it before creating a new draft.",
      });
    }

    if (!normalizedIssues.length) {
      if (existingActiveNote && existingActiveNote.status === "draft") {
        await ServiceNote.deleteOne({ _id: existingActiveNote._id });
      }

      return res.json({
        message: "Draft cleared",
        data: null,
      });
    }

    const draftNote =
      existingActiveNote && existingActiveNote.status === "draft"
        ? existingActiveNote
        : new ServiceNote({
            qr: qr._id,
            qrId: qr.qrId,
            user: req.user._id,
          });

    draftNote.vehicleNumber = qr.vehicleNumber || null;
    draftNote.activatedShowroom = qr.showroom || null;
    draftNote.selectedShowroom = null;
    draftNote.issues = normalizedIssues;
    draftNote.status = "draft";
    draftNote.submittedAt = null;
    draftNote.inServiceAt = null;
    draftNote.archivedAt = null;
    draftNote.linkedService = null;
    draftNote.advisorRemarks = "";
    draftNote.resolutionSummary = "";

    await draftNote.save();
    await draftNote.populate("activatedShowroom", "name showroomCode city");
    await draftNote.populate("selectedShowroom", "name showroomCode city");

    res.json({
      message: "Draft saved",
      data: draftNote,
    });
  } catch (error) {
    console.log("Save service draft error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/submit", protect, async (req, res) => {
  try {
    const { noteId, qrId, showroomId } = req.body;

    if (!showroomId) {
      return res.status(400).json({ message: "Showroom is required" });
    }

    const showroom = await Showroom.findById(showroomId).select(
      "name showroomCode city isActive"
    );
    if (!showroom || showroom.isActive === false) {
      return res.status(404).json({ message: "Showroom not found" });
    }

    const filter = {
      user: req.user._id,
      status: "draft",
    };

    if (noteId) {
      filter._id = noteId;
    } else if (qrId) {
      filter.qrId = qrId;
    } else {
      return res.status(400).json({ message: "Draft note not found" });
    }

    const note = await ServiceNote.findOne(filter);
    if (!note) {
      return res.status(404).json({ message: "Draft note not found" });
    }

    const qr = await findOwnedQr(note.qrId, req.user._id);
    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    if (!note.issues?.length) {
      return res.status(400).json({ message: "Add at least one issue first" });
    }

    note.vehicleNumber = qr.vehicleNumber || note.vehicleNumber || null;
    note.activatedShowroom = qr.showroom || note.activatedShowroom || null;
    note.selectedShowroom = showroom._id;
    note.status = "submitted";
    note.submittedAt = new Date();
    note.inServiceAt = null;
    note.archivedAt = null;
    await note.save();

    await note.populate("activatedShowroom", "name showroomCode city");
    await note.populate("selectedShowroom", "name showroomCode city");

    res.json({
      message: "Service request submitted",
      data: note,
    });
  } catch (error) {
    console.log("Submit service draft error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showroom/incoming", protectShowroom, async (req, res) => {
  try {
    const notes = await ServiceNote.find({
      selectedShowroom: req.showroom.id,
      status: { $in: ["submitted", "in_service"] },
    })
      .select(
        "qrId vehicleNumber issues status submittedAt inServiceAt createdAt updatedAt"
      )
      .sort({ submittedAt: -1, updatedAt: -1 })
      .lean();

    res.json(notes);
  } catch (error) {
    console.log("Showroom incoming notes error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showroom/by-qr/:qrId", protectShowroom, async (req, res) => {
  try {
    const { qrId } = req.params;

    const note = await ServiceNote.findOne({
      qrId,
      selectedShowroom: req.showroom.id,
      status: { $in: ["submitted", "in_service"] },
    })
      .populate("selectedShowroom", "name showroomCode city")
      .sort({ submittedAt: -1, updatedAt: -1 });

    res.json(note || null);
  } catch (error) {
    console.log("Showroom note by QR error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/showroom/start/:noteId", protectShowroom, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await ServiceNote.findOne({
      _id: noteId,
      selectedShowroom: req.showroom.id,
      status: { $in: ["submitted", "in_service"] },
    }).populate("selectedShowroom", "name showroomCode city");

    if (!note) {
      return res.status(404).json({ message: "Service note not found" });
    }

    if (note.status !== "in_service") {
      note.status = "in_service";
      note.inServiceAt = new Date();
      await note.save();
    }

    res.json({
      message: "Service note is now in service",
      data: note,
    });
  } catch (error) {
    console.log("Start showroom service note error", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
