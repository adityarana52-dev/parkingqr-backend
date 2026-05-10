const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const DriverPartner = require("../models/DriverPartner");
const DriverContactUnlock = require("../models/DriverContactUnlock");

const router = express.Router();
const DRIVER_CONTACT_AMOUNT = 10;

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
    distanceKm:
      typeof distanceKm === "number" && Number.isFinite(distanceKm)
        ? Number(distanceKm.toFixed(1))
        : null,
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

    if (
      hasCoords &&
      isValidCoordinate(driver?.location?.latitude) &&
      isValidCoordinate(driver?.location?.longitude)
    ) {
      distanceKm = calculateDistanceKm(
        Number(latitude),
        Number(longitude),
        Number(driver.location.latitude),
        Number(driver.location.longitude)
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
