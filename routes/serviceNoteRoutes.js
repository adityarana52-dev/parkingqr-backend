const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const ServiceNote = require("../models/ServiceNote");
const ShowroomCustomerRequest = require("../models/ShowroomCustomerRequest");
const sendPushNotification = require("../utils/sendPushNotification");

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

function normalizeVehicleType(vehicleType) {
  const value = String(vehicleType || "").trim().toLowerCase();
  return value || null;
}

function normalizeRequestType(requestType) {
  if (requestType === "service" || requestType === "service_booking") {
    return "service_booking";
  }

  if (requestType === "insurance" || requestType === "insurance_quote") {
    return "insurance_quote";
  }

  return null;
}

function formatRequestDate(date) {
  if (!date) {
    return null;
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function dedupeIssueObjects(issueObjects = []) {
  const seen = new Set();

  return issueObjects.filter((item) => {
    const text = String(item?.text || "").trim();
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildCustomerRequestIssues({
  requestType,
  preferredServiceDate,
  notesSnapshot,
}) {
  const baseIssues =
    requestType === "service_booking" ? normalizeIssues(notesSnapshot) : [];

  const autoIssues =
    requestType === "service_booking"
      ? [
          { text: "Periodic service booking requested." },
          ...(formatRequestDate(preferredServiceDate)
            ? [
                {
                  text: `Preferred appointment date: ${formatRequestDate(
                    preferredServiceDate
                  )}.`,
                },
              ]
            : []),
        ]
      : [
          {
            text: "Insurance renewal quote requested. Please share the best available quote.",
          },
        ];

  return dedupeIssueObjects([...baseIssues, ...autoIssues]).slice(0, 12);
}

async function notifyShowroom(showroom, title, body, data = {}) {
  if (!showroom?.expoPushToken) {
    return;
  }

  await sendPushNotification(showroom.expoPushToken, title, body, data);
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
    const qr = await findOwnedQr(qrId, req.user._id);

    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    await qr.populate("showroom", "name showroomCode city vehicleType");

    const normalizedVehicleType = normalizeVehicleType(qr.vehicleType);

    const queryFilter = normalizedVehicleType
      ? {
          $and: [
            { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
            { vehicleType: normalizedVehicleType },
          ],
        }
      : { $or: [{ isActive: true }, { isActive: { $exists: false } }] };

    const showrooms = await Showroom.find(queryFilter)
      .select("name showroomCode city vehicleType")
      .lean();

    const activatedShowroomId = qr.showroom?._id?.toString() || null;
    const activatedShowroom = qr.showroom
      ? {
          _id: qr.showroom._id,
          name: qr.showroom.name,
          showroomCode: qr.showroom.showroomCode,
          city: qr.showroom.city,
          vehicleType: qr.showroom.vehicleType,
          isActivatedShowroom: true,
        }
      : null;

    const mergedShowrooms = [...showrooms];

    const shouldIncludeActivatedShowroom =
      activatedShowroom &&
      (!normalizedVehicleType ||
        normalizeVehicleType(activatedShowroom.vehicleType) ===
          normalizedVehicleType);

    if (
      shouldIncludeActivatedShowroom &&
      !mergedShowrooms.some(
        (showroom) => showroom._id.toString() === activatedShowroomId
      )
    ) {
      mergedShowrooms.push(activatedShowroom);
    }

    const sortedShowrooms = mergedShowrooms
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
      activatedShowroom,
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
      "name showroomCode city isActive expoPushToken"
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

    await notifyShowroom(
      showroom,
      "New Service Note",
      `${note.vehicleNumber || note.qrId} has submitted service notes for your showroom.`,
      {
        type: "SHOWROOM_SERVICE_NOTE",
        qrId: note.qrId,
        noteId: note._id?.toString(),
      }
    );

    res.json({
      message: "Service request submitted",
      data: note,
    });
  } catch (error) {
    console.log("Submit service draft error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/customer-request", protect, async (req, res) => {
  try {
    const {
      qrId,
      showroomIds,
      requestType,
      preferredServiceDate,
      notesSnapshot,
    } = req.body;

    if (!qrId) {
      return res.status(400).json({ message: "QR ID required" });
    }

    const normalizedRequestType = normalizeRequestType(requestType);
    if (!normalizedRequestType) {
      return res.status(400).json({ message: "Invalid request type" });
    }

    const uniqueShowroomIds = Array.from(
      new Set(
        (Array.isArray(showroomIds) ? showroomIds : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );

    if (!uniqueShowroomIds.length) {
      return res.status(400).json({ message: "Select at least one showroom" });
    }

    const qr = await findOwnedQr(qrId, req.user._id);
    if (!qr) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const normalizedVehicleType = normalizeVehicleType(qr.vehicleType);

    const validShowrooms = await Showroom.find({
      _id: { $in: uniqueShowroomIds },
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
      ...(normalizedVehicleType ? { vehicleType: normalizedVehicleType } : {}),
    }).select("_id name showroomCode expoPushToken");

    if (!validShowrooms.length) {
      return res.status(404).json({ message: "Showroom not found" });
    }

    const issues = buildCustomerRequestIssues({
      requestType: normalizedRequestType,
      preferredServiceDate,
      notesSnapshot,
    });

    const requestPayload = validShowrooms.map((showroom) => ({
      qr: qr._id,
      qrId: qr.qrId,
      user: req.user._id,
      showroom: showroom._id,
      vehicleNumber: qr.vehicleNumber || null,
      requestType: normalizedRequestType,
      issues,
      preferredServiceDate:
        normalizedRequestType === "service_booking" && preferredServiceDate
          ? new Date(preferredServiceDate)
          : null,
      status: "new",
      requestedAt: new Date(),
    }));

    const createdRequests = await ShowroomCustomerRequest.insertMany(
      requestPayload
    );

    await Promise.all(
      validShowrooms.map((showroom) =>
        notifyShowroom(
          showroom,
          normalizedRequestType === "insurance_quote"
            ? "New Insurance Quote Request"
            : "New Service Booking Request",
          normalizedRequestType === "insurance_quote"
            ? `${qr.vehicleNumber || qr.qrId} requested an insurance quote.`
            : `${qr.vehicleNumber || qr.qrId} requested a service booking.`,
          {
            type:
              normalizedRequestType === "insurance_quote"
                ? "SHOWROOM_INSURANCE_QUOTE"
                : "SHOWROOM_SERVICE_BOOKING",
            qrId: qr.qrId,
            vehicleNumber: qr.vehicleNumber || null,
          }
        )
      )
    );

    res.json({
      message:
        normalizedRequestType === "insurance_quote"
          ? "Insurance quote request shared"
          : "Service booking request shared",
      data: createdRequests,
    });
  } catch (error) {
    console.log("Create showroom customer request error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showroom/incoming", protectShowroom, async (req, res) => {
  try {
    const [notes, customerRequests] = await Promise.all([
      ServiceNote.find({
        selectedShowroom: req.showroom.id,
        status: { $in: ["submitted", "in_service"] },
      })
        .select(
          "qrId vehicleNumber user issues status submittedAt inServiceAt createdAt updatedAt"
        )
        .populate("user", "mobile city")
        .sort({ submittedAt: -1, updatedAt: -1 })
        .lean(),
      ShowroomCustomerRequest.find({
        showroom: req.showroom.id,
        status: { $in: ["new", "contacted"] },
      })
        .select(
          "qrId vehicleNumber user issues requestType status preferredServiceDate requestedAt createdAt updatedAt"
        )
        .populate("user", "mobile city")
        .sort({ requestedAt: -1, updatedAt: -1 })
        .lean(),
    ]);

    const mappedNotes = notes.map((note) => ({
      ...note,
      entryType: "service_note",
      requestType: "manual_note",
      submittedAt: note.submittedAt || note.updatedAt || note.createdAt,
      actionable: true,
      customer: {
        mobile: note.user?.mobile || null,
        city: note.user?.city || null,
      },
    }));

    const mappedRequests = customerRequests.map((request) => ({
      ...request,
      entryType: "customer_request",
      submittedAt:
        request.requestedAt || request.updatedAt || request.createdAt,
      actionable: false,
      customer: {
        mobile: request.user?.mobile || null,
        city: request.user?.city || null,
      },
    }));

    const mergedItems = [...mappedRequests, ...mappedNotes].sort((a, b) => {
      const aTime = new Date(
        a.submittedAt || a.updatedAt || a.createdAt || 0
      ).getTime();
      const bTime = new Date(
        b.submittedAt || b.updatedAt || b.createdAt || 0
      ).getTime();

      return bTime - aTime;
    });

    res.json(mergedItems);
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

router.delete("/:noteId", protect, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await ServiceNote.findOne({
      _id: noteId,
      user: req.user._id,
    });

    if (!note) {
      return res.status(404).json({ message: "Service note not found" });
    }

    if (note.linkedService) {
      return res.status(400).json({
        message: "Completed service notes cannot be deleted.",
      });
    }

    await note.deleteOne();

    res.json({
      message: "Service note deleted",
    });
  } catch (error) {
    console.log("Delete service note error", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
