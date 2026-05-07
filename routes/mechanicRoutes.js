const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const MechanicPartner = require("../models/MechanicPartner");
const MechanicContactUnlock = require("../models/MechanicContactUnlock");

const router = express.Router();
const MECHANIC_CONTACT_AMOUNT = 10;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeVehicleTypeList(vehicleTypes = []) {
  const values = Array.isArray(vehicleTypes) ? vehicleTypes : [vehicleTypes];
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

function buildMechanicResponse(mechanic, distanceKm = null) {
  return {
    _id: mechanic._id,
    name: mechanic.name,
    city: mechanic.city,
    area: mechanic.area,
    serviceRadiusKm: mechanic.serviceRadiusKm,
    vehicleTypes: Array.isArray(mechanic.vehicleTypes)
      ? mechanic.vehicleTypes
      : [],
    distanceKm:
      typeof distanceKm === "number" && Number.isFinite(distanceKm)
        ? Number(distanceKm.toFixed(1))
        : null,
  };
}

async function getNearbyMechanics({
  query = "",
  vehicleType = "",
  latitude = null,
  longitude = null,
  limit = 10,
}) {
  const normalizedQuery = normalizeText(query);
  const normalizedVehicleType = normalizeText(vehicleType);
  const filter = { isActive: true, status: "approved" };

  if (normalizedVehicleType) {
    filter.vehicleTypeKeys = { $in: [normalizedVehicleType] };
  }

  if (normalizedQuery) {
    filter.$or = [
      { city: { $regex: normalizedQuery, $options: "i" } },
      { area: { $regex: normalizedQuery, $options: "i" } },
      { name: { $regex: normalizedQuery, $options: "i" } },
      { addressLine1: { $regex: normalizedQuery, $options: "i" } },
    ];
  }

  const mechanics = await MechanicPartner.find(filter)
    .sort({ createdAt: -1 })
    .limit(60);

  const hasCoords =
    isValidCoordinate(latitude) && isValidCoordinate(longitude);

  let enriched = mechanics.map((mechanic) => {
    let distanceKm = null;

    if (
      hasCoords &&
      isValidCoordinate(mechanic?.location?.latitude) &&
      isValidCoordinate(mechanic?.location?.longitude)
    ) {
      distanceKm = calculateDistanceKm(
        Number(latitude),
        Number(longitude),
        Number(mechanic.location.latitude),
        Number(mechanic.location.longitude)
      );
    }

    return {
      mechanic,
      distanceKm,
    };
  });

  if (hasCoords) {
    enriched = enriched.filter(({ mechanic, distanceKm }) => {
      if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
        return false;
      }

      return distanceKm <= Number(mechanic.serviceRadiusKm || 5);
    });

    enriched.sort((a, b) => a.distanceKm - b.distanceKm);
  } else {
    enriched.sort((a, b) => {
      const cityCompare = String(a.mechanic.city).localeCompare(
        String(b.mechanic.city)
      );
      if (cityCompare !== 0) {
        return cityCompare;
      }
      return String(a.mechanic.area).localeCompare(String(b.mechanic.area));
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
      vehicleTypes,
      latitude,
      longitude,
    } = req.body;
    const normalizedVehicleTypes = normalizeVehicleTypeList(vehicleTypes);

    if (
      !name ||
      !isValidMobile(mobile) ||
      !city ||
      !area ||
      !normalizedVehicleTypes.length ||
      !isValidCoordinate(latitude) ||
      !isValidCoordinate(longitude)
    ) {
      return res.status(400).json({
        message:
          "Name, mobile, city, area, vehicle types and service pin are required.",
      });
    }

    const existing = await MechanicPartner.findOne({
      mobile: String(mobile).trim(),
    });

    if (existing) {
      return res.status(409).json({
        message: "This mobile number is already onboarded as a mechanic partner.",
      });
    }

    const partner = await MechanicPartner.create({
      name: String(name).trim(),
      mobile: String(mobile).trim(),
      stateCode: String(stateCode || "").trim().toUpperCase(),
      city: String(city).trim(),
      area: String(area).trim(),
      addressLine1: String(addressLine1 || "").trim(),
      serviceRadiusKm:
        Number(serviceRadiusKm) > 0 ? Number(serviceRadiusKm) : 5,
      vehicleTypes: normalizedVehicleTypes,
      vehicleTypeKeys: normalizedVehicleTypes.map((item) => item.toLowerCase()),
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
      isActive: false,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      mechanicId: partner._id,
      message: "Mechanic partner request submitted for admin approval.",
    });
  } catch (error) {
    console.error("MECHANIC ONBOARD ERROR:", error);
    res.status(500).json({
      message: "Mechanic onboarding failed.",
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const {
      query = "",
      vehicleType = "",
      latitude = null,
      longitude = null,
    } = req.query;

    const results = await getNearbyMechanics({
      query,
      vehicleType,
      latitude,
      longitude,
      limit: 16,
    });

    res.json({
      results: results.map(({ mechanic, distanceKm }) =>
        buildMechanicResponse(mechanic, distanceKm)
      ),
    });
  } catch (error) {
    console.error("MECHANIC SEARCH ERROR:", error);
    res.status(500).json({
      message: "Unable to search mechanics right now.",
    });
  }
});

router.post("/create-contact-order", async (req, res) => {
  try {
    const options = {
      amount: MECHANIC_CONTACT_AMOUNT * 100,
      currency: "INR",
      receipt: `mechanic_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("MECHANIC CREATE ORDER ERROR:", error);
    res.status(500).json({
      message: "Unable to create mechanic contact order.",
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
      vehicleType,
      issue,
      query,
      latitude,
      longitude,
      selectedMechanicId,
    } = req.body;

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !customerName ||
      !isValidMobile(mobile) ||
      !vehicleType
    ) {
      return res.status(400).json({
        message: "Customer details and payment information are required.",
      });
    }

    const duplicate = await MechanicContactUnlock.findOne({
      razorpay_payment_id,
    });

    if (duplicate) {
      return res.status(409).json({
        message: "This mechanic contact unlock has already been processed.",
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

    const nearestMechanics = await getNearbyMechanics({
      query,
      vehicleType,
      latitude,
      longitude,
      limit: 8,
    });

    let sortedMechanics = nearestMechanics;

    if (selectedMechanicId) {
      sortedMechanics = [
        ...nearestMechanics.filter(
          ({ mechanic }) => String(mechanic._id) === String(selectedMechanicId)
        ),
        ...nearestMechanics.filter(
          ({ mechanic }) => String(mechanic._id) !== String(selectedMechanicId)
        ),
      ];
    }

    const topTwo = sortedMechanics.slice(0, 2);

    await MechanicContactUnlock.create({
      customerName: String(customerName).trim(),
      mobile: String(mobile).trim(),
      vehicleType: String(vehicleType).trim(),
      issue: String(issue || "").trim(),
      query: String(query || "").trim(),
      searchLocation: {
        latitude: isValidCoordinate(latitude) ? Number(latitude) : null,
        longitude: isValidCoordinate(longitude) ? Number(longitude) : null,
      },
      selectedMechanicId: selectedMechanicId || null,
      revealedMechanicIds: topTwo.map(({ mechanic }) => mechanic._id),
      razorpay_payment_id,
      razorpay_order_id,
      amount: MECHANIC_CONTACT_AMOUNT,
      status: "success",
    });

    res.json({
      success: true,
      contacts: topTwo.map(({ mechanic, distanceKm }) => ({
        mechanicId: mechanic._id,
        name: mechanic.name,
        mobile: mechanic.mobile,
        city: mechanic.city,
        area: mechanic.area,
        distanceKm:
          typeof distanceKm === "number" && Number.isFinite(distanceKm)
            ? Number(distanceKm.toFixed(1))
            : null,
      })),
    });
  } catch (error) {
    console.error("MECHANIC VERIFY ORDER ERROR:", error);
    res.status(500).json({
      message: "Unable to verify mechanic contact payment.",
    });
  }
});

module.exports = router;
