const express = require("express");
const router = express.Router();
const axios = require("axios");
const Showroom = require("../models/Showroom");
const SalesPerson = require("../models/SalesPerson");
const QrCode = require("../models/QrCode");
const mongoose = require("mongoose");
const StateCounter = require("../models/StateCounter");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const QrRequest = require("../models/QrRequest");
const sendPushNotification = require("../utils/sendPushNotification");
const ShowroomNotification = require("../models/ShowroomNotification");
const OfferLog = require("../models/OfferLog");
const User = require("../models/User");
const ReminderLog = require("../models/ReminderLog");
const CommissionLedger = require("../models/CommissionLedger");
const {
  ensureCommissionEntriesForShowroom,
  formatMonthLabel,
  getMonthKey,
} = require("../utils/commissionLedger");
const PayoutDetails = require("../models/PayoutDetails");
const ShowroomClosureRequest = require("../models/ShowroomClosureRequest");
const ShowroomPasswordOtp = require("../models/ShowroomPasswordOtp");
const { normalizeStateCode } = require("../utils/stateCodeMap");
const {
  createOrUpdateWithdrawalRequest,
  getPayoutDetailsForEntity,
  getPayoutSummary,
  getWithdrawalMapForShowroom,
  isClosedMonth,
  serializePayoutDetails,
} = require("../utils/withdrawals");
const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const DEFAULT_FAST2SMS_ROUTE = "dlt_manual";
const DEFAULT_FAST2SMS_SENDER_ID = "GEPSMS";
const DEFAULT_FAST2SMS_ENTITY_ID = "1201177428135766247";
const DEFAULT_FAST2SMS_TEMPLATE_ID = "1207177522097367395";
const DEFAULT_FAST2SMS_OTP_TEMPLATE =
  "{otp} is your OTP to change showroom login password for carbiQR. Do not share it with anyone.";

function normalizeMobile(mobile) {
  return String(mobile || "").trim();
}

function isValidMobile(mobile) {
  return MOBILE_REGEX.test(normalizeMobile(mobile));
}

function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function maskMobile(mobile) {
  const normalizedMobile = normalizeMobile(mobile);

  if (normalizedMobile.length !== 10) {
    return normalizedMobile || "";
  }

  return `${normalizedMobile.slice(0, 2)}XXXXXX${normalizedMobile.slice(-2)}`;
}

async function sendOtpSms(mobile, otp) {
  if (!process.env.FAST2SMS_API_KEY) {
    throw new Error("FAST2SMS API key is not configured.");
  }

  const route = process.env.FAST2SMS_ROUTE || DEFAULT_FAST2SMS_ROUTE;
  const senderId =
    process.env.FAST2SMS_SENDER_ID || DEFAULT_FAST2SMS_SENDER_ID;
  const entityId =
    process.env.FAST2SMS_ENTITY_ID || DEFAULT_FAST2SMS_ENTITY_ID;
  const templateId =
    process.env.FAST2SMS_TEMPLATE_ID || DEFAULT_FAST2SMS_TEMPLATE_ID;
  const otpTemplate =
    process.env.FAST2SMS_OTP_MESSAGE || DEFAULT_FAST2SMS_OTP_TEMPLATE;
  const message = otpTemplate.replace("{otp}", otp);

  const payload = new URLSearchParams({
    route,
    sender_id: senderId,
    template_id: templateId,
    entity_id: entityId,
    message,
    numbers: mobile,
    flash: "0",
  });

  await axios.post("https://www.fast2sms.com/dev/bulkV2", payload.toString(), {
    headers: {
      authorization: process.env.FAST2SMS_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

async function getMonthlySalesSummaries(showroomId, monthKey) {
  const salesRows = await CommissionLedger.aggregate([
    {
      $match: {
        showroom: new mongoose.Types.ObjectId(showroomId),
        monthKey,
      },
    },
    {
      $group: {
        _id: "$salesPerson",
        totalActivations: { $sum: 1 },
        totalEarnings: { $sum: "$salesCommission" },
      },
    },
  ]);

  return new Map(
    salesRows
      .filter((row) => row._id)
      .map((row) => [
        row._id.toString(),
        {
          totalActivations: row.totalActivations || 0,
          totalEarnings: row.totalEarnings || 0,
        },
      ])
  );
}

// ✅ Create Showroom
// ✅ Create Showroom (State Wise Auto Code)
router.post("/create", async (req, res) => {
  try {

    const {
        name,
        city,
        stateCode,
        addressLine1,
        addressLine2,
        pincode,
        phone,
        contactPerson,
        username,
        password,
        vehicleType
        } = req.body;

    if (!name || !city || !stateCode || !username || !password) {
      return res.status(400).json({
        message: "Name, city, stateCode, username and password required"
      });
    }

    const upperStateCode = normalizeStateCode(stateCode);

    if (!upperStateCode) {
      return res.status(400).json({
        message: "Valid state code required"
      });
    }

    // 🔥 Generate showroomCode using StateCounter
    const counter = await StateCounter.findOneAndUpdate(
      { stateCode: upperStateCode },
      { $inc: { lastNumber: 1 } },
      { new: true, upsert: true }
    );

    const paddedNumber = counter.lastNumber
      .toString()
      .padStart(5, "0");

    const showroomCode = upperStateCode + paddedNumber;

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const showroom = await Showroom.create({
          name,
          city,
          stateCode: upperStateCode,

          showroomCode,

          contactPerson,
          phone,

          addressLine1,
          addressLine2,
          pincode,

          username,
          password: hashedPassword,

          vehicleType //Add this
        });

    res.status(201).json(showroom);

  } catch (error) {

    console.log("Create Showroom Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

// ✅ Get All Showrooms
router.get("/", async (req, res) => {
  try {
    const showrooms = await Showroom.find().sort({ createdAt: -1 });
    res.json(showrooms);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Showroom Analytics (Allocated vs Activated QR)
router.get("/analytics", async (req, res) => {
  try {
    const showrooms = await Showroom.find();

    const data = [];

    for (let showroom of showrooms) {
      const totalAllocated = await QrCode.countDocuments({
        showroom: showroom._id,
      });

      const totalActivated = await QrCode.countDocuments({
        showroom: showroom._id,
        isAssigned: true,
      });

      data.push({
        showroomName: showroom.name,
        city: showroom.city,
        totalAllocated,
        totalActivated,
      });
    }

    res.json(data);

  } catch (error) {
    console.log("Showroom Analytics Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Salesperson Analytics
router.get("/sales-analytics/:showroomId", async (req, res) => {
  try {
    const { showroomId } = req.params;

    const result = await QrCode.aggregate([
      {
        $match: {
          showroom: new mongoose.Types.ObjectId(showroomId),
          isAssigned: true,
        },
      },
      {
        $group: {
          _id: "$salesPerson",
          totalActivated: { $sum: 1 },
        },
      },
      {
        $sort: { totalActivated: -1 },
      },
    ]);

    res.json(result);

  } catch (error) {
    console.log("Sales Analytics Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Showroom Dashboard
router.get("/payout-details", protectShowroom, async (req, res) => {
  try {
    const payoutDetails = await getPayoutDetailsForEntity("showroom", req.showroom.id);

    res.json({
      payoutDetails: serializePayoutDetails(payoutDetails),
      payoutSummary: getPayoutSummary(payoutDetails),
    });
  } catch (error) {
    console.log("Showroom payout details error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/payout-details", protectShowroom, async (req, res) => {
  try {
    const {
      mode,
      accountHolderName,
      upiId = "",
      accountNumber = "",
      ifsc = "",
      bankName = "",
    } = req.body;

    if (!mode || !accountHolderName) {
      return res.status(400).json({ message: "Mode and account holder name required" });
    }

    if (mode === "upi" && !upiId) {
      return res.status(400).json({ message: "UPI ID required" });
    }

    if (mode === "bank" && (!accountNumber || !ifsc || !bankName)) {
      return res.status(400).json({ message: "Bank account, IFSC and bank name required" });
    }

    const payoutDetails = await PayoutDetails.findOneAndUpdate(
      {
        entityType: "showroom",
        entityId: req.showroom.id,
      },
      {
        showroom: req.showroom.id,
        mode,
        accountHolderName: accountHolderName.trim(),
        upiId: mode === "upi" ? upiId.trim() : null,
        accountNumber: mode === "bank" ? accountNumber.trim() : null,
        ifsc: mode === "bank" ? ifsc.trim().toUpperCase() : null,
        bankName: mode === "bank" ? bankName.trim() : null,
        isActive: true,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({
      message: "Payout details saved",
      payoutDetails: serializePayoutDetails(payoutDetails),
      payoutSummary: getPayoutSummary(payoutDetails),
    });
  } catch (error) {
    console.log("Save showroom payout details error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/withdrawals/request", protectShowroom, async (req, res) => {
  try {
    const { entityType, salesPersonId = null, monthKey, requestNote = "" } = req.body;
    const showroomId = req.showroom.id;

    if (!entityType || !monthKey) {
      return res.status(400).json({ message: "Entity type and month required" });
    }

    if (!isClosedMonth(monthKey)) {
      return res.status(400).json({ message: "Current month cannot be withdrawn" });
    }

    let entityId = showroomId;
    let resolvedSalesPersonId = null;

    if (entityType === "salesperson") {
      if (!salesPersonId) {
        return res.status(400).json({ message: "Salesperson required" });
      }

      const salesPerson = await SalesPerson.findOne({
        _id: salesPersonId,
        showroom: showroomId,
      }).select("_id");

      if (!salesPerson) {
        return res.status(404).json({ message: "Salesperson not found" });
      }

      entityId = salesPerson._id;
      resolvedSalesPersonId = salesPerson._id;
    } else if (entityType !== "showroom") {
      return res.status(400).json({ message: "Invalid entity type" });
    }

    const withdrawal = await createOrUpdateWithdrawalRequest({
      showroomId,
      entityType,
      entityId,
      salesPersonId: resolvedSalesPersonId,
      monthKey,
      requestNote,
    });

    res.json({
      message: "Withdrawal request submitted",
      withdrawalId: withdrawal._id,
      status: withdrawal.status,
    });
  } catch (error) {
    console.log("Create withdrawal request error", error);
    res.status(400).json({ message: error.message || "Unable to request withdrawal" });
  }
});

router.get("/dashboard", protectShowroom, async (req, res) => {
  try {

    const showroomId = req.showroom.id;

    const showroom = await Showroom.findById(showroomId);

    if (!showroom) {
      return res.status(404).json({
        message: "Showroom not found"
      });
    }

    // Remaining stock
    const remainingStock =
      showroom.totalQRAllotted - showroom.totalQRActivated;

    await ensureCommissionEntriesForShowroom(showroomId);

    const currentMonthKey = getMonthKey(new Date());

    const monthlySummary = await CommissionLedger.aggregate([
      {
        $match: {
          showroom: new mongoose.Types.ObjectId(showroomId),
          monthKey: currentMonthKey,
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$showroomCommission" },
          totalActivations: { $sum: 1 },
        },
      },
    ]);

    const salesSummaryMap = await getMonthlySalesSummaries(showroomId, currentMonthKey);

    const activeSalesPersons = await SalesPerson.find({
      showroom: showroomId,
      isActive: true
    }).select("name");

    const salesPersons = activeSalesPersons
      .map((salesPerson) => {
        const monthlyStats =
          salesSummaryMap.get(salesPerson._id.toString()) || {
            totalActivations: 0,
            totalEarnings: 0,
          };

        return {
          _id: salesPerson._id,
          name: salesPerson.name,
          totalActivations: monthlyStats.totalActivations,
          totalEarnings: monthlyStats.totalEarnings,
        };
      })
      .sort((a, b) => {
        if (b.totalActivations !== a.totalActivations) {
          return b.totalActivations - a.totalActivations;
        }

        return b.totalEarnings - a.totalEarnings;
      });

    res.json({

      showroomName: showroom.name,
      showroomCode: showroom.showroomCode,
      city: showroom.city,

      isActive: showroom.isActive,

      totalAllotted: showroom.totalQRAllotted,
      totalActivated: showroom.totalQRActivated,
      remainingStock,

      totalEarnings: monthlySummary[0]?.totalEarnings || 0,
      lifetimeTotalEarnings: showroom.totalEarnings,
      currentMonthKey,
      currentMonthLabel: formatMonthLabel(currentMonthKey),
      currentMonthActivations: monthlySummary[0]?.totalActivations || 0,

      salesPersons

    });

  } catch (error) {

    console.log("Showroom Dashboard Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

router.get("/commission-history", protectShowroom, async (req, res) => {
  try {
    const showroomId = req.showroom.id;
    const currentMonthKey = getMonthKey(new Date());

    await ensureCommissionEntriesForShowroom(showroomId);

    const showroomPayoutDetails = await getPayoutDetailsForEntity("showroom", showroomId);
    const withdrawalMap = await getWithdrawalMapForShowroom(showroomId);
    const salesPayoutDetails = await PayoutDetails.find({
      entityType: "salesperson",
      showroom: showroomId,
      isActive: true,
    }).select("entityId mode accountHolderName upiId accountNumber ifsc bankName isActive");

    const salesPayoutMap = new Map(
      salesPayoutDetails.map((details) => [details.entityId.toString(), details])
    );

    const monthlySummaries = await CommissionLedger.aggregate([
      {
        $match: {
          showroom: new mongoose.Types.ObjectId(showroomId),
        },
      },
      {
        $group: {
          _id: "$monthKey",
          activatedAt: { $min: "$activatedAt" },
          showroomEarnings: { $sum: "$showroomCommission" },
          showroomActivations: { $sum: 1 },
        },
      },
      {
        $sort: {
          activatedAt: -1,
        },
      },
    ]);

    const salesBreakdown = await CommissionLedger.aggregate([
      {
        $match: {
          showroom: new mongoose.Types.ObjectId(showroomId),
          salesPerson: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            monthKey: "$monthKey",
            salesPerson: "$salesPerson",
          },
          totalActivations: { $sum: 1 },
          totalEarnings: { $sum: "$salesCommission" },
        },
      },
      {
        $lookup: {
          from: SalesPerson.collection.name,
          localField: "_id.salesPerson",
          foreignField: "_id",
          as: "salesPersonData",
        },
      },
      {
        $unwind: {
          path: "$salesPersonData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          "_id.monthKey": -1,
          totalEarnings: -1,
        },
      },
    ]);

    const monthMap = new Map();

    for (const month of monthlySummaries) {
      const showroomWithdrawalKey = `showroom:${showroomId}:${month._id}`;

      monthMap.set(month._id, {
        monthKey: month._id,
        monthLabel: formatMonthLabel(month._id),
        showroomEarnings: month.showroomEarnings || 0,
        showroomActivations: month.showroomActivations || 0,
        canRequestShowroomWithdrawal: isClosedMonth(month._id),
        showroomPayoutSummary: getPayoutSummary(showroomPayoutDetails),
        showroomWithdrawal: withdrawalMap.get(showroomWithdrawalKey) || null,
        salesPersons: [],
      });
    }

    for (const row of salesBreakdown) {
      const month = monthMap.get(row._id.monthKey);
      if (!month) {
        continue;
      }

      month.salesPersons.push({
        _id: row._id.salesPerson,
        name: row.salesPersonData?.name || "Salesperson",
        totalActivations: row.totalActivations || 0,
        totalEarnings: row.totalEarnings || 0,
        canRequestWithdrawal: isClosedMonth(row._id.monthKey),
        payoutSummary: getPayoutSummary(
          salesPayoutMap.get(row._id.salesPerson.toString()) || null
        ),
        withdrawal:
          withdrawalMap.get(
            `salesperson:${row._id.salesPerson.toString()}:${row._id.monthKey}`
          ) || null,
      });
    }

    res.json({
      currentMonthKey,
      showroomPayoutSummary: getPayoutSummary(showroomPayoutDetails),
      months: Array.from(monthMap.values()),
    });

  } catch (error) {
    console.log("Commission history error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {

  try {

    const { username, password } = req.body;

    const showroom = await Showroom.findOne({ username });

    if (!showroom) {
      return res.status(400).json({
        message: "Invalid username or password"
      });
    }

    if (!showroom.isActive) {
      return res.status(403).json({
        message: "Showroom account inactive. Please contact support."
      });
    }

    const isMatch = await bcrypt.compare(password, showroom.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid username or password"
      });
    }

    const token = jwt.sign(
      { id: showroom._id },
      process.env.JWT_SECRET
    );

    res.json({
      message: "Login successful",
      token,
      showroomId: showroom._id,
      showroomCode: showroom.showroomCode
    });

  } catch (error) {

    console.log("Showroom Login Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.get("/change-login/details", protectShowroom, async (req, res) => {
  try {
    const showroom = req.showroomData;
    const mobile = normalizeMobile(showroom?.phone);

    res.json({
      username: showroom?.username || "",
      maskedMobile: maskMobile(mobile),
      hasPhone: Boolean(isValidMobile(mobile)),
    });
  } catch (error) {
    console.log("Fetch showroom change-login details error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/change-login/send-otp", protectShowroom, async (req, res) => {
  try {
    const showroom = req.showroomData;
    const mobile = normalizeMobile(showroom?.phone);

    if (!isValidMobile(mobile)) {
      return res.status(400).json({
        message: "A valid registered mobile number is required to change password",
      });
    }

    const now = new Date();
    const existingSession = await ShowroomPasswordOtp.findOne({
      showroom: showroom._id,
    });

    if (
      existingSession?.lastSentAt &&
      now.getTime() - existingSession.lastSentAt.getTime() <
        OTP_RESEND_COOLDOWN_MS
    ) {
      const retryAfterSeconds = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS -
          (now.getTime() - existingSession.lastSentAt.getTime())) /
          1000
      );

      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds}s before requesting OTP again.`,
      });
    }

    const otp = generateOtp();
    await sendOtpSms(mobile, otp);

    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    if (existingSession) {
      existingSession.mobile = mobile;
      existingSession.otpHash = hashOtp(otp);
      existingSession.expiresAt = expiresAt;
      existingSession.attempts = 0;
      existingSession.resendCount = (existingSession.resendCount || 0) + 1;
      existingSession.lastSentAt = now;
      await existingSession.save();
    } else {
      await ShowroomPasswordOtp.create({
        showroom: showroom._id,
        mobile,
        otpHash: hashOtp(otp),
        expiresAt,
        attempts: 0,
        resendCount: 1,
        lastSentAt: now,
      });
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
      maskedMobile: maskMobile(mobile),
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.log(
      "Showroom change-login send OTP error",
      error.response?.data || error.message
    );
    res.status(500).json({
      message:
        error.message === "FAST2SMS API key is not configured."
          ? error.message
          : "OTP send failed",
    });
  }
});

router.post("/change-login/verify-otp", protectShowroom, async (req, res) => {
  try {
    const otp = String(req.body?.otp || "").trim();
    const newPassword = String(req.body?.newPassword || "").trim();
    const showroom = req.showroomData;

    if (!otp || otp.length !== OTP_LENGTH) {
      return res.status(400).json({ message: "Valid OTP required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    const otpSession = await ShowroomPasswordOtp.findOne({
      showroom: showroom._id,
    });

    if (!otpSession) {
      return res.status(400).json({
        message: "OTP not found. Please request a new OTP.",
      });
    }

    if (otpSession.expiresAt.getTime() < Date.now()) {
      await otpSession.deleteOne();
      return res.status(400).json({
        message: "OTP expired. Please request a new OTP.",
      });
    }

    if ((otpSession.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await otpSession.deleteOne();
      return res.status(429).json({
        message: "Too many invalid attempts. Please request a new OTP.",
      });
    }

    if (otpSession.otpHash !== hashOtp(otp)) {
      otpSession.attempts = (otpSession.attempts || 0) + 1;
      await otpSession.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    showroom.password = await bcrypt.hash(newPassword, 10);
    await showroom.save();
    await otpSession.deleteOne();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.log("Showroom change-login verify OTP error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/save-push-token", protectShowroom, async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({ message: "Push token required" });
    }

    const showroom = await Showroom.findById(req.showroom.id);

    if (!showroom) {
      return res.status(404).json({ message: "Showroom not found" });
    }

    showroom.expoPushToken = pushToken;
    await showroom.save();

    res.json({ message: "Push token saved" });
  } catch (error) {
    console.log("Save showroom push token error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/closure-request", protectShowroom, async (req, res) => {
  try {
    const request = await ShowroomClosureRequest.findOne({
      showroom: req.showroom.id,
    })
      .sort({ createdAt: -1 })
      .populate("reviewedBy", "mobile");

    res.json(request || null);
  } catch (error) {
    console.log("Fetch showroom closure request error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/closure-request", protectShowroom, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    const details = String(req.body?.details || "").trim();

    if (!reason) {
      return res.status(400).json({ message: "Closure reason required" });
    }

    const showroom = await Showroom.findById(req.showroom.id);

    if (!showroom) {
      return res.status(404).json({ message: "Showroom not found" });
    }

    const existingPendingRequest = await ShowroomClosureRequest.findOne({
      showroom: showroom._id,
      status: "pending",
    });

    if (existingPendingRequest) {
      return res.status(400).json({
        message: "A closure request is already pending for review",
      });
    }

    const request = await ShowroomClosureRequest.create({
      showroom: showroom._id,
      showroomName: showroom.name || "",
      showroomCode: showroom.showroomCode || "",
      city: showroom.city || "",
      contactPerson: showroom.contactPerson || "",
      phone: showroom.phone || "",
      reason,
      details,
    });

    res.status(201).json({
      message: "Closure request submitted successfully",
      data: request,
    });
  } catch (error) {
    console.log("Create showroom closure request error", error);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/qr-stock", protectShowroom, async (req, res) => {

  try {

    const showroomId = req.showroom.id;

    const totalAllocated = await QrCode.countDocuments({
      showroom: showroomId
    });

    const totalActivated = await QrCode.countDocuments({
      showroom: showroomId,
      isAssigned: true
    });

    const remaining = totalAllocated - totalActivated;

    res.json({
      showroomCode: req.showroom.showroomCode,
      totalAllocated,
      totalActivated,
      remaining
    });

  } catch (error) {

    console.log("QR Stock Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.post("/request-qr", protectShowroom, async (req, res) => {

  try {

    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        message: "Quantity required"
      });
    }

    const showroom = await Showroom.findById(req.showroom.id);

    const request = await QrRequest.create({
      showroom: req.showroom.id,
      quantity,
      vehicleType: showroom.vehicleType   // 👈 AUTO
    });

    res.status(201).json({
      message: "QR request submitted",
      request
    });

  } catch (error) {

    console.log("QR Request Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

//for show qr requirement history
router.get("/qr-requests", protectShowroom, async (req, res) => {

  try {

    const requests = await QrRequest.find({
      showroom: req.showroom.id
    })
    .sort({ createdAt: -1 });

    res.json(requests);

  } catch (error) {

    console.log("QR Request History Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

// Send showroom offer
router.post("/send-offer", protectShowroom, async (req,res)=>{

try{

const {message} = req.body;

if(!message){
return res.status(400).json({
message:"Message required"
});
}

const showroomId = req.showroom.id;


// month start
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0,0,0,0);


// limit check (ONLY OfferLog)
const count = await OfferLog.countDocuments({
showroomId:showroomId,
createdAt:{ $gte:startOfMonth }
});

console.log("Monthly offers:",count);

if(count >= 2){
return res.status(400).json({
message:"You can send only 2 offers per month"
});
}


// users
const qrs = await QrCode.find({
showroom:showroomId,
isAssigned:true
}).populate("assignedTo");


const users = qrs.filter(qr => qr.assignedTo?.expoPushToken);


// send notifications fast
await Promise.all(

users.map(qr =>
sendPushNotification(
qr.assignedTo.expoPushToken,
"🏪 Showroom Offer",
message,
{type:"offer"}
)
)

);


// save history
const createdOffer = await OfferLog.create({
showroomId:showroomId,
message:message
});


res.json({
message:"Offer sent successfully",
totalUsers:users.length,
offer: createdOffer
});

}catch(error){

console.log("Send offer error",error);

res.status(500).json({
message:"Server error"
});

}

});


//offer to send message from showroom
router.get("/offer-count", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0,0,0,0);

const count = await OfferLog.countDocuments({
showroomId:showroomId,
createdAt:{ $gte:startOfMonth }
});

res.json({count});

}catch(error){

res.status(500).json({
message:"Server error"
});

}

});

// ============================
// Insurance Due Vehicles
// ============================

router.get("/insurance-due", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const today = new Date();

// 7 days past
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

// 30 days future
const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const vehicles = await QrCode.find({
showroom: showroomId,
insuranceExpiryDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ insuranceExpiryDate: 1 });

res.json(vehicles);

}catch(error){

console.log("Insurance due error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Service Due Vehicles
// ============================

router.get("/service-due", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const today = new Date();

// 7 days past
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

// 30 days future
const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const vehicles = await QrCode.find({
showroom: showroomId,
nextServiceDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ nextServiceDate: 1 });

res.json(vehicles);

}catch(error){

console.log("Service due error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Send Insurance Reminder
// ============================

router.post("/send-insurance-reminder", protectShowroom, async (req,res)=>{

try{




const { message = "" } = req.body;

const showroomId = req.showroom.id;


const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

const todayReminderCount = await ReminderLog.countDocuments({
showroomId:req.showroom.id,
type:"insurance",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

if(todayReminderCount >= 2){
return res.status(400).json({
message:"Daily reminder limit reached (2 per day)"
});
}

const today = new Date();

// limits
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const qrs = await QrCode.find({
showroom: showroomId,
insuranceExpiryDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ insuranceExpiryDate: 1 });

let count = 0;

for(const qr of qrs){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"} Insurance Reminder`,

message || `Insurance for vehicle ${qr.vehicleNumber || "NEW VEHICLE"} is expiring soon. Please visit ${qr.showroom?.name || "our showroom"} for renewal.`,

{ type: "insurance-reminder" }

);

count++;

}

}

// save log
await ReminderLog.create({
showroomId:showroomId,
type:"insurance",
message:message
});

res.json({
message:"Insurance reminders sent",
total:count
});

}catch(error){

console.log("Send insurance reminder error",error);

res.status(500).json({message:"Server error"});

}

});


// ============================
// Send Service Reminder
// ============================

router.post("/send-service-reminder", protectShowroom, async (req,res)=>{

try{

const { message = "" } = req.body;

const showroomId = req.showroom.id;

const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

// check today reminders
const todayReminderCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"service",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

if(todayReminderCount >= 2){

return res.status(400).json({
message:"Daily service reminder limit reached (2 per day)"
});

}

const today = new Date();

// limits
const pastLimit = new Date();
pastLimit.setDate(today.getDate() - 7);

const futureLimit = new Date();
futureLimit.setDate(today.getDate() + 30);

const qrs = await QrCode.find({
showroom: showroomId,
nextServiceDate: { $gte: pastLimit, $lte: futureLimit }
})
.populate("assignedTo")
.populate("showroom")
.sort({ nextServiceDate: 1 });

let count = 0;

for(const qr of qrs){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"} Service Reminder`,

message || `Vehicle ${qr.vehicleNumber || "NEW VEHICLE"} service is due. Please visit ${qr.showroom?.name || "our showroom"} for service.`,

{ type: "service-reminder" }

);

count++;

}

}

// save log
await ReminderLog.create({
showroomId:showroomId,
type:"service",
message:message
});


res.json({
message:"Service reminders sent",
total:count
});

}catch(error){

console.log("Send service reminder error",error);

res.status(500).json({message:"Server error"});

}

});



// ============================
// Get Today Reminder Count
// ============================

router.get("/reminder-count", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const todayStart = new Date();
todayStart.setHours(0,0,0,0);

const todayEnd = new Date();
todayEnd.setHours(23,59,59,999);

const insuranceCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"insurance",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

const serviceCount = await ReminderLog.countDocuments({
showroomId:showroomId,
type:"service",
createdAt:{ $gte: todayStart, $lte: todayEnd }
});

res.json({
insurance:insuranceCount,
service:serviceCount
});

}catch(error){

console.log("Reminder count error",error);

res.status(500).json({message:"Server error"});

}

});

//showroom offer history check 
router.get("/offer-history", protectShowroom, async (req,res)=>{

try{

const showroomId = req.showroom.id;

const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0,0,0,0);

const offers = await OfferLog.find({
showroomId:showroomId,
createdAt:{$gte:startOfMonth}
})
.populate("showroomId","name")
.sort({createdAt:-1});

res.json(offers);

}catch(error){

console.log("Offer history error",error);

res.status(500).json({message:"Server error"});

}

});


router.get("/activated-qrs", protectShowroom, async (req, res) => {
  try {
    const showroomId = req.showroom.id;

    const qrs = await QrCode.find({
      showroom: showroomId,
      qrStatus: "activated"
    })
    .sort({ createdAt: -1 }) // 🔥 latest first
    .populate("assignedTo", "mobile");

    res.json(qrs);

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching activated QRs" });
  }
});

module.exports = router;
