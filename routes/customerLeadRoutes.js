const crypto = require("crypto");
const express = require("express");
const CustomerLead = require("../models/CustomerLead");
const Showroom = require("../models/Showroom");
const OfferLog = require("../models/OfferLog");
const ShowroomNotification = require("../models/ShowroomNotification");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const sendPushNotification = require("../utils/sendPushNotification");

const router = express.Router();

const MOBILE_REGEX = /^[6-9]\d{9}$/;
const VEHICLE_TYPES = new Set(["car", "bike", "auto"]);

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeMobile(value = "") {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeVehicleType(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeCity(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeBrandList(brands = []) {
  const values = Array.isArray(brands) ? brands : [brands];
  const seen = new Set();

  return values
    .map((item) => normalizeText(item))
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

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isActiveShowroomFilter() {
  return { $or: [{ isActive: true }, { isActive: { $exists: false } }] };
}

async function notifyMatchedShowrooms(showrooms, lead) {
  await Promise.all(
    showrooms.map(async (showroom) => {
      try {
        const message = `${
          String(lead.vehicleType || "").toUpperCase()
        } lead received from ${lead.city} for ${Array.isArray(lead.brands) ? lead.brands.join(", ") : "selected brand"} (${lead.mobile}).`;

        await ShowroomNotification.create({
          showroom: showroom._id,
          message,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        });

        if (!showroom?.expoPushToken) {
          return;
        }

        const pushResult = await sendPushNotification(
          showroom.expoPushToken,
          "New Customer Lead",
          message,
          {
            type: "SHOWROOM_CUSTOMER_LEAD",
            leadGroupId: lead.leadGroupId,
            vehicleType: lead.vehicleType,
            city: lead.city,
            brands: lead.brands,
            mobile: lead.mobile,
            showroomId: showroom._id?.toString?.() || null,
          }
        );

        if (!pushResult?.ok) {
          console.log("Customer lead push not confirmed:", {
            showroomId: showroom._id?.toString?.(),
            result: pushResult,
          });
        }
      } catch (error) {
        console.log("Notify showroom customer lead error", error);
      }
    })
  );
}

router.post("/", async (req, res) => {
  try {
    const mobile = normalizeMobile(req.body?.mobile);
    const vehicleType = normalizeVehicleType(req.body?.vehicleType);
    const brands = normalizeBrandList(req.body?.brands || req.body?.brand);
    const brandKeys = brands.map((item) => item.toLowerCase());
    const city = normalizeText(req.body?.city);
    const cityKey = normalizeCity(req.body?.city);

    if (!MOBILE_REGEX.test(mobile)) {
      return res.status(400).json({ message: "Valid mobile number required" });
    }

    if (!VEHICLE_TYPES.has(vehicleType)) {
      return res.status(400).json({ message: "Valid vehicle type required" });
    }

    if (!brands.length) {
      return res.status(400).json({ message: "Select at least one brand" });
    }

    if (!cityKey) {
      return res.status(400).json({ message: "City is required" });
    }

    const leadGroupId = crypto.randomUUID();
    const showroomFilter = {
      city: new RegExp(`^${escapeRegex(cityKey)}$`, "i"),
      vehicleType,
      ...isActiveShowroomFilter(),
    };

    if (brandKeys.length) {
      showroomFilter.vehicleBrandKeys = { $in: brandKeys };
    }

    const showrooms = await Showroom.find(showroomFilter).select(
      "_id name city vehicleType expoPushToken vehicleBrandKeys"
    );

    if (!showrooms.length) {
      const unassignedLead = await CustomerLead.create({
        leadGroupId,
        mobile,
        vehicleType,
        brands,
        brandKeys,
        city,
        cityKey,
        showroom: null,
        status: "unassigned",
        matchedShowroomCount: 0,
      });

      return res.status(201).json({
        message: "Lead saved successfully",
        matchedShowroomsCount: 0,
        data: [unassignedLead],
      });
    }

    const payload = showrooms.map((showroom) => ({
      leadGroupId,
      showroom: showroom._id,
      mobile,
      vehicleType,
      brands,
      brandKeys,
      city,
      cityKey,
      status: "new",
      matchedShowroomCount: showrooms.length,
    }));

    const createdLeads = await CustomerLead.insertMany(payload);
    await notifyMatchedShowrooms(showrooms, {
      leadGroupId,
      mobile,
      vehicleType,
      brands,
      city,
    });

    res.status(201).json({
      message: "Lead saved successfully",
      matchedShowroomsCount: showrooms.length,
      data: createdLeads,
    });
  } catch (error) {
    console.log("Create customer lead error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/offers", async (req, res) => {
  try {
    const city = normalizeText(req.query?.city);
    const cityKey = normalizeCity(req.query?.city);
    const vehicleType = normalizeVehicleType(req.query?.vehicleType);
    const brands = normalizeBrandList(
      req.query?.brands
        ? String(req.query.brands)
            .split(",")
            .map((item) => item.trim())
        : []
    );
    const brandKeys = brands.map((item) => item.toLowerCase());

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const showroomFilter = {
      ...isActiveShowroomFilter(),
    };

    if (cityKey) {
      showroomFilter.city = new RegExp(`^${escapeRegex(cityKey)}$`, "i");
    }

    if (vehicleType) {
      if (!VEHICLE_TYPES.has(vehicleType)) {
        return res.status(400).json({ message: "Valid vehicle type required" });
      }

      showroomFilter.vehicleType = vehicleType;
    }

    if (brandKeys.length) {
      showroomFilter.vehicleBrandKeys = { $in: brandKeys };
    }

    const showrooms = await Showroom.find(showroomFilter).select("_id");

    const showroomIds = showrooms.map((item) => item._id);
    if (!showroomIds.length) {
      return res.json([]);
    }

    const offers = await OfferLog.find({
      showroomId: { $in: showroomIds },
      createdAt: { $gte: last30Days },
    })
      .populate("showroomId", "name city phone contactNumber vehicleType")
      .sort({ createdAt: -1 });

    res.json(offers);
  } catch (error) {
    console.log("Fetch customer lead offers error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/showroom", protectShowroom, async (req, res) => {
  try {
    const leads = await CustomerLead.find({
      showroom: req.showroom.id,
    })
      .select(
        "leadGroupId mobile vehicleType brands city status matchedShowroomCount createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json(leads);
  } catch (error) {
    console.log("Fetch showroom customer leads error", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
