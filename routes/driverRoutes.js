const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const DriverPartner = require("../models/DriverPartner");
const DriverContactUnlock = require("../models/DriverContactUnlock");
const OtpSession = require("../models/OtpSession");
const protectDriver = require("../middleware/driverAuthMiddleware");

const router = express.Router();
const DRIVER_CONTACT_AMOUNT = 10;
const DRIVER_LIVE_FRESHNESS_MS = 30 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const DEFAULT_FAST2SMS_ROUTE = "dlt_manual";
const DEFAULT_FAST2SMS_SENDER_ID = "GEPSMS";
const DEFAULT_FAST2SMS_ENTITY_ID = "1201177428135766247";
const DEFAULT_FAST2SMS_TEMPLATE_ID = "1207177522097367395";
const DEFAULT_FAST2SMS_OTP_TEMPLATE =
  "{otp} is your OTP for carbiQr login. Do not share it with anyone. Regards - Grantham Enterprises";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeVehicleCategoryList(vehicleCategories = []) {
  const values = Array.isArray(vehicleCategories)
    ? vehicleCategories
    : [vehicleCategories];
  const seen = new Set();

  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function generateDriverToken(driver) {
  return jwt.sign(
    { id: driver._id, type: "driver" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

async function sendOtpSms(mobile, otp) {
  if (!process.env.FAST2SMS_API_KEY) {
    throw new Error("FAST2SMS API key is not configured.");
  }

  const route =
    process.env.DRIVER_FAST2SMS_ROUTE ||
    process.env.FAST2SMS_ROUTE ||
    DEFAULT_FAST2SMS_ROUTE;
  const senderId =
    process.env.DRIVER_FAST2SMS_SENDER_ID ||
    process.env.FAST2SMS_SENDER_ID ||
    DEFAULT_FAST2SMS_SENDER_ID;
  const entityId =
    process.env.DRIVER_FAST2SMS_ENTITY_ID ||
    process.env.FAST2SMS_ENTITY_ID ||
    DEFAULT_FAST2SMS_ENTITY_ID;
  const templateId =
    process.env.DRIVER_FAST2SMS_TEMPLATE_ID ||
    process.env.FAST2SMS_TEMPLATE_ID ||
    DEFAULT_FAST2SMS_TEMPLATE_ID;
  const otpTemplate =
    process.env.DRIVER_FAST2SMS_OTP_MESSAGE ||
    process.env.FAST2SMS_OTP_MESSAGE ||
    DEFAULT_FAST2SMS_OTP_TEMPLATE;
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

function isValidMobile(value = "") {
  return /^[6-9]\d{9}$/.test(String(value || "").trim());
}

function isValidCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  return Number.isFinite(Number(value));
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function buildRotationSeed(query = "", vehicleCategory = "") {
  const now = new Date();
  const dateSeed = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  return `${dateSeed}|${normalizeText(query)}|${normalizeText(vehicleCategory)}`;
}

function getRotationScore(value = "", seed = "") {
  const input = `${String(value)}|${seed}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function buildDriverResponse(driver, distanceKm = null) {
  return {
    _id: driver._id,
    name: driver.name,
    city: driver.city,
    area: driver.area,
    serviceRadiusKm: driver.serviceRadiusKm,
    vehicleCategories: Array.isArray(driver.vehicleCategories)
      ? driver.vehicleCategories
      : [],
    onlineStatus: Boolean(driver.onlineStatus),
    lastLocationUpdatedAt:
      driver.liveLocation?.updatedAt || driver.lastSeenAt || null,
    distanceKm:
      typeof distanceKm === "number" && Number.isFinite(distanceKm)
        ? Number(distanceKm.toFixed(1))
        : null,
  };
}

function getDriverSearchLocation(driver) {
  const hasFreshLiveLocation =
    Boolean(driver.onlineStatus) &&
    isValidCoordinate(driver?.liveLocation?.latitude) &&
    isValidCoordinate(driver?.liveLocation?.longitude) &&
    driver?.liveLocation?.updatedAt &&
    new Date(driver.liveLocation.updatedAt).getTime() >=
      Date.now() - DRIVER_LIVE_FRESHNESS_MS;

  if (hasFreshLiveLocation) {
    return {
      latitude: Number(driver.liveLocation.latitude),
      longitude: Number(driver.liveLocation.longitude),
    };
  }

  return {
    latitude: Number(driver.location.latitude),
    longitude: Number(driver.location.longitude),
  };
}

async function getNearbyDrivers({
  query = "",
  vehicleCategory = "",
  latitude = null,
  longitude = null,
  limit = 10,
}) {
  const normalizedQuery = normalizeText(query);
  const normalizedVehicleCategory = normalizeText(vehicleCategory);
  const hasCoords =
    isValidCoordinate(latitude) && isValidCoordinate(longitude);
  const rotationSeed = buildRotationSeed(query, vehicleCategory);

  const drivers = await DriverPartner.find({
    isActive: true,
    status: "approved",
  })
    .sort({ createdAt: -1 })
    .limit(100);

  let enriched = drivers.map((driver) => {
    let distanceKm = null;
    const searchLocation = getDriverSearchLocation(driver);

    if (
      hasCoords &&
      isValidCoordinate(searchLocation?.latitude) &&
      isValidCoordinate(searchLocation?.longitude)
    ) {
      distanceKm = calculateDistanceKm(
        Number(latitude),
        Number(longitude),
        Number(searchLocation.latitude),
        Number(searchLocation.longitude)
      );
    }

    return {
      driver,
      distanceKm,
    };
  });

  if (normalizedVehicleCategory) {
    enriched = enriched.filter(({ driver }) => {
      const storedKeys = Array.isArray(driver.vehicleCategoryKeys)
        ? driver.vehicleCategoryKeys.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      const storedLabels = Array.isArray(driver.vehicleCategories)
        ? driver.vehicleCategories.map((item) => normalizeText(item)).filter(Boolean)
        : [];

      const availableKeys = new Set([...storedKeys, ...storedLabels]);
      return availableKeys.has(normalizedVehicleCategory);
    });
  }

  if (normalizedQuery) {
    enriched = enriched.filter(({ driver }) => {
      const name = normalizeText(driver.name);
      const city = normalizeText(driver.city);
      const area = normalizeText(driver.area);
      const addressLine1 = normalizeText(driver.addressLine1);
      const stateCode = normalizeText(driver.stateCode);

      if (
        city === normalizedQuery ||
        area === normalizedQuery ||
        name === normalizedQuery
      ) {
        return true;
      }

      const searchableText = [name, city, area, addressLine1, stateCode]
        .filter(Boolean)
        .join(" ");

      return searchableText.includes(normalizedQuery);
    });
  }

  if (hasCoords) {
    enriched = enriched.filter(({ driver, distanceKm }) => {
      if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
        return false;
      }

      return distanceKm <= Number(driver.serviceRadiusKm || 5);
    });

    enriched.sort((a, b) => {
      const distanceBucketA = Math.floor((a.distanceKm || 0) * 2);
      const distanceBucketB = Math.floor((b.distanceKm || 0) * 2);

      if (distanceBucketA !== distanceBucketB) {
        return distanceBucketA - distanceBucketB;
      }

      return (
        getRotationScore(a.driver._id, rotationSeed) -
        getRotationScore(b.driver._id, rotationSeed)
      );
    });
  } else {
    enriched.sort((a, b) => {
      return (
        getRotationScore(a.driver._id, rotationSeed) -
        getRotationScore(b.driver._id, rotationSeed)
      );
    });
  }

  return enriched.slice(0, limit);
}

async function handleSendDriverOtp(req, res) {
  try {
    const mobile = String(req.body?.mobile || "").trim();

    if (!isValidMobile(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    const driver = await DriverPartner.findOne({ mobile });

    if (!driver || driver.status !== "approved" || !driver.isActive) {
      return res.status(403).json({
        message: "Driver account is not approved yet.",
      });
    }

    const now = new Date();
    const existingSession = await OtpSession.findOne({ mobile });

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
      existingSession.otpHash = hashOtp(otp);
      existingSession.expiresAt = expiresAt;
      existingSession.attempts = 0;
      existingSession.resendCount = (existingSession.resendCount || 0) + 1;
      existingSession.lastSentAt = now;
      await existingSession.save();
    } else {
      await OtpSession.create({
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
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.log("Driver OTP send error:", error.response?.data || error.message);
    res.status(500).json({ message: "Driver OTP send failed" });
  }
}

router.post("/send-otp", handleSendDriverOtp);
router.post("/resend-otp", handleSendDriverOtp);

router.post("/verify-otp", async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || "").trim();
    const otp = String(req.body?.otp || "").trim();

    if (!isValidMobile(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    if (!otp || otp.length !== OTP_LENGTH) {
      return res.status(400).json({ message: "Valid OTP required" });
    }

    const otpSession = await OtpSession.findOne({ mobile });

    if (!otpSession) {
      return res.status(400).json({ message: "OTP not found. Please request again." });
    }

    if (otpSession.expiresAt.getTime() < Date.now()) {
      await otpSession.deleteOne();
      return res.status(400).json({ message: "OTP expired. Please request again." });
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

    const driver = await DriverPartner.findOne({
      mobile,
      status: "approved",
      isActive: true,
    });

    if (!driver) {
      await otpSession.deleteOne();
      return res.status(403).json({
        message: "Driver account is not approved yet.",
      });
    }

    driver.lastSeenAt = new Date();
    await driver.save();

    const token = generateDriverToken(driver);
    await otpSession.deleteOne();

    res.json({
      token,
      driverId: driver._id,
    });
  } catch (error) {
    console.log("Driver verify OTP error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/onboard", async (req, res) => {
  try {
    const {
      name,
      mobile,
      stateCode,
      city,
      area,
      addressLine1,
      serviceRadiusKm,
      vehicleCategories,
      latitude,
      longitude,
    } = req.body;

    const normalizedVehicleCategories =
      normalizeVehicleCategoryList(vehicleCategories);

    if (
      !name ||
      !isValidMobile(mobile) ||
      !city ||
      !area ||
      !normalizedVehicleCategories.length ||
      !isValidCoordinate(latitude) ||
      !isValidCoordinate(longitude)
    ) {
      return res.status(400).json({
        message:
          "Name, mobile, city, area, vehicle categories and service pin are required.",
      });
    }

    const existing = await DriverPartner.findOne({
      mobile: String(mobile).trim(),
    });

    if (existing) {
      return res.status(409).json({
        message: "This mobile number is already onboarded as a driver partner.",
      });
    }

    const partner = await DriverPartner.create({
      name: String(name).trim(),
      mobile: String(mobile).trim(),
      stateCode: String(stateCode || "").trim().toUpperCase(),
      city: String(city).trim(),
      area: String(area).trim(),
      addressLine1: String(addressLine1 || "").trim(),
      serviceRadiusKm:
        Number(serviceRadiusKm) > 0 ? Number(serviceRadiusKm) : 5,
      vehicleCategories: normalizedVehicleCategories,
      vehicleCategoryKeys: normalizedVehicleCategories.map((item) =>
        item.toLowerCase()
      ),
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
      isActive: false,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      driverId: partner._id,
      message: "Driver partner request submitted for admin approval.",
    });
  } catch (error) {
    console.error("DRIVER ONBOARD ERROR:", error);
    res.status(500).json({
      message: "Driver onboarding failed.",
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const {
      query = "",
      vehicleCategory = "",
      latitude = null,
      longitude = null,
    } = req.query;

    const results = await getNearbyDrivers({
      query,
      vehicleCategory,
      latitude,
      longitude,
      limit: 16,
    });

    res.json({
      results: results.map(({ driver, distanceKm }) =>
        buildDriverResponse(driver, distanceKm)
      ),
    });
  } catch (error) {
    console.error("DRIVER SEARCH ERROR:", error);
    res.status(500).json({
      message: "Unable to search drivers right now.",
    });
  }
});

router.get("/me", protectDriver, async (req, res) => {
  const driver = req.driver;
  res.json({
    _id: driver._id,
    name: driver.name,
    mobile: driver.mobile,
    stateCode: driver.stateCode,
    city: driver.city,
    area: driver.area,
    addressLine1: driver.addressLine1,
    serviceRadiusKm: driver.serviceRadiusKm,
    vehicleCategories: driver.vehicleCategories || [],
    onlineStatus: Boolean(driver.onlineStatus),
    lastSeenAt: driver.lastSeenAt || null,
    liveLocation: driver.liveLocation || null,
    baseLocation: driver.location || null,
  });
});

router.post("/update-categories", protectDriver, async (req, res) => {
  try {
    const normalizedVehicleCategories = normalizeVehicleCategoryList(
      req.body?.vehicleCategories
    );

    if (!normalizedVehicleCategories.length) {
      return res.status(400).json({
        message: "Please select at least one vehicle category.",
      });
    }

    req.driver.vehicleCategories = normalizedVehicleCategories;
    req.driver.vehicleCategoryKeys = normalizedVehicleCategories.map((item) =>
      item.toLowerCase()
    );
    req.driver.lastSeenAt = new Date();
    await req.driver.save();

    res.json({
      success: true,
      message: "Driver categories updated successfully.",
      vehicleCategories: req.driver.vehicleCategories,
    });
  } catch (error) {
    console.log("Driver update categories error:", error);
    res.status(500).json({
      message: "Unable to update driver categories right now.",
    });
  }
});

router.post("/go-online", protectDriver, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
      return res.status(400).json({ message: "Valid location is required." });
    }

    req.driver.onlineStatus = true;
    req.driver.liveLocation = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      updatedAt: new Date(),
    };
    req.driver.lastSeenAt = new Date();
    await req.driver.save();

    res.json({
      success: true,
      message: "Driver is now online.",
      data: {
        onlineStatus: req.driver.onlineStatus,
        liveLocation: req.driver.liveLocation,
      },
    });
  } catch (error) {
    console.log("Driver go-online error:", error);
    res.status(500).json({ message: "Unable to go online right now." });
  }
});

router.post("/go-offline", protectDriver, async (req, res) => {
  try {
    req.driver.onlineStatus = false;
    req.driver.lastSeenAt = new Date();
    await req.driver.save();

    res.json({
      success: true,
      message: "Driver is now offline.",
      data: {
        onlineStatus: req.driver.onlineStatus,
      },
    });
  } catch (error) {
    console.log("Driver go-offline error:", error);
    res.status(500).json({ message: "Unable to go offline right now." });
  }
});

router.post("/update-live-location", protectDriver, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
      return res.status(400).json({ message: "Valid location is required." });
    }

    req.driver.liveLocation = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      updatedAt: new Date(),
    };
    req.driver.lastSeenAt = new Date();
    await req.driver.save();

    res.json({
      success: true,
      message: "Driver live location updated.",
      data: {
        onlineStatus: req.driver.onlineStatus,
        liveLocation: req.driver.liveLocation,
      },
    });
  } catch (error) {
    console.log("Driver live location update error:", error);
    res.status(500).json({ message: "Unable to update live location right now." });
  }
});

router.post("/create-contact-order", async (req, res) => {
  try {
    const options = {
      amount: DRIVER_CONTACT_AMOUNT * 100,
      currency: "INR",
      receipt: `driver_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("DRIVER CREATE ORDER ERROR:", error);
    res.status(500).json({
      message: "Unable to create driver contact order.",
    });
  }
});

router.post("/verify-contact-order", async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      customerName,
      mobile,
      vehicleCategory,
      issue,
      query,
      latitude,
      longitude,
      selectedDriverId,
    } = req.body;

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !customerName ||
      !isValidMobile(mobile) ||
      !vehicleCategory
    ) {
      return res.status(400).json({
        message: "Customer details and payment information are required.",
      });
    }

    const duplicate = await DriverContactUnlock.findOne({
      razorpay_payment_id,
    });

    if (duplicate) {
      return res.status(409).json({
        message: "This driver contact unlock has already been processed.",
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        message: "Invalid payment signature.",
      });
    }

    const nearestDrivers = await getNearbyDrivers({
      query,
      vehicleCategory,
      latitude,
      longitude,
      limit: 8,
    });

    let sortedDrivers = nearestDrivers;

    if (selectedDriverId) {
      sortedDrivers = [
        ...nearestDrivers.filter(
          ({ driver }) => String(driver._id) === String(selectedDriverId)
        ),
        ...nearestDrivers.filter(
          ({ driver }) => String(driver._id) !== String(selectedDriverId)
        ),
      ];
    }

    const topTwo = sortedDrivers.slice(0, 2);

    await DriverContactUnlock.create({
      customerName: String(customerName).trim(),
      mobile: String(mobile).trim(),
      vehicleCategory: String(vehicleCategory).trim(),
      issue: String(issue || "").trim(),
      query: String(query || "").trim(),
      searchLocation: {
        latitude: isValidCoordinate(latitude) ? Number(latitude) : null,
        longitude: isValidCoordinate(longitude) ? Number(longitude) : null,
      },
      selectedDriverId: selectedDriverId || null,
      revealedDriverIds: topTwo.map(({ driver }) => driver._id),
      razorpay_payment_id,
      razorpay_order_id,
      amount: DRIVER_CONTACT_AMOUNT,
      status: "success",
    });

    res.json({
      success: true,
      contacts: topTwo.map(({ driver, distanceKm }) => ({
        driverId: driver._id,
        name: driver.name,
        mobile: driver.mobile,
        city: driver.city,
        area: driver.area,
        distanceKm:
          typeof distanceKm === "number" && Number.isFinite(distanceKm)
            ? Number(distanceKm.toFixed(1))
            : null,
      })),
    });
  } catch (error) {
    console.error("DRIVER VERIFY ORDER ERROR:", error);
    res.status(500).json({
      message: "Unable to verify driver contact payment.",
    });
  }
});

module.exports = router;
