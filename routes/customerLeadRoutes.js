const crypto = require("crypto");
const express = require("express");
const CustomerLead = require("../models/CustomerLead");
const Showroom = require("../models/Showroom");
const OfferLog = require("../models/OfferLog");
const ShowroomNotification = require("../models/ShowroomNotification");
const SalesPerson = require("../models/SalesPerson");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const sendPushNotification = require("../utils/sendPushNotification");

const router = express.Router();

const MOBILE_REGEX = /^[6-9]\d{9}$/;
const VEHICLE_TYPES = new Set(["car", "bike", "auto"]);
const LEAD_OUTCOMES = new Set([
  "call_attempted",
  "not_answered",
  "busy",
  "call_back_later",
  "interested",
  "cold_customer",
  "wrong_number",
  "converted",
  "not_interested",
]);

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

function toLeadResponse(lead) {
  const item = lead?.toObject ? lead.toObject() : lead;
  const activities = Array.isArray(item?.activities) ? item.activities : [];

  return {
    ...item,
    assignedSalesPerson: item?.assignedSalesPerson
      ? {
          _id: item.assignedSalesPerson._id || item.assignedSalesPerson,
          name:
            item.assignedSalesPerson?.name || item.assignedSalesPersonName || "",
          mobile: item.assignedSalesPerson?.mobile || null,
        }
      : item?.assignedSalesPersonName
      ? {
          _id: null,
          name: item.assignedSalesPersonName,
          mobile: null,
        }
      : null,
    activities: activities.map((activity) => ({
      ...activity,
      salesPerson: activity?.salesPerson
        ? {
            _id: activity.salesPerson?._id || activity.salesPerson,
            name: activity.salesPerson?.name || activity.salesPersonName || "",
            mobile: activity.salesPerson?.mobile || null,
          }
        : activity?.salesPersonName
        ? {
            _id: null,
            name: activity.salesPersonName,
            mobile: null,
          }
        : null,
    })),
  };
}

async function notifyMatchedShowrooms(showrooms, lead) {
  await Promise.all(
    showrooms.map(async (showroom) => {
      try {
        const message = `${String(lead.vehicleType || "").toUpperCase()} lead received from ${
          lead.city
        } for ${Array.isArray(lead.brands) ? lead.brands.join(", ") : "selected brand"} (${lead.mobile}).`;

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
      .populate("assignedSalesPerson", "name mobile isActive")
      .populate("activities.salesPerson", "name mobile isActive")
      .sort({ createdAt: -1, updatedAt: -1 })
      .lean();

    res.json(leads.map(toLeadResponse));
  } catch (error) {
    console.log("Fetch showroom customer leads error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:leadId/assign", protectShowroom, async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    const salesPersonId = normalizeText(req.body?.salesPersonId);

    const lead = await CustomerLead.findOne({
      _id: leadId,
      showroom: req.showroom.id,
    });

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    if (!salesPersonId) {
      lead.assignedSalesPerson = null;
      lead.assignedSalesPersonName = "";
      lead.assignedAt = null;
      await lead.save();
      await lead.populate("assignedSalesPerson", "name mobile isActive");
      return res.json({
        message: "Lead moved back to unassigned queue",
        data: toLeadResponse(lead),
      });
    }

    const salesPerson = await SalesPerson.findOne({
      _id: salesPersonId,
      showroom: req.showroom.id,
      isActive: true,
    }).select("_id name mobile");

    if (!salesPerson) {
      return res.status(404).json({ message: "Active salesperson not found" });
    }

    lead.assignedSalesPerson = salesPerson._id;
    lead.assignedSalesPersonName = salesPerson.name;
    lead.assignedAt = new Date();
    await lead.save();
    await lead.populate("assignedSalesPerson", "name mobile isActive");

    res.json({
      message: "Lead assigned successfully",
      data: toLeadResponse(lead),
    });
  } catch (error) {
    console.log("Assign customer lead error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/bulk-assign", protectShowroom, async (req, res) => {
  try {
    const leadIds = Array.isArray(req.body?.leadIds)
      ? req.body.leadIds.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const rawAssignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];

    if (!leadIds.length) {
      return res.status(400).json({ message: "No leads provided for assignment" });
    }

    const assignments = [];
    for (const item of rawAssignments) {
      const salesPersonId = normalizeText(item?.salesPersonId);
      const count = Number(item?.count);

      if (!salesPersonId || !Number.isInteger(count) || count <= 0) {
        continue;
      }

      assignments.push({ salesPersonId, count });
    }

    if (!assignments.length) {
      return res.status(400).json({ message: "Please enter at least one valid assignment" });
    }

    const totalRequested = assignments.reduce((sum, item) => sum + item.count, 0);
    if (totalRequested > leadIds.length) {
      return res.status(400).json({
        message: `You can assign only ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} in this request`,
      });
    }

    const salesPeople = await SalesPerson.find({
      _id: { $in: assignments.map((item) => item.salesPersonId) },
      showroom: req.showroom.id,
      isActive: true,
    }).select("_id name mobile");

    const salesPersonMap = new Map(
      salesPeople.map((item) => [String(item._id), item])
    );

    for (const item of assignments) {
      if (!salesPersonMap.has(item.salesPersonId)) {
        return res.status(404).json({ message: "One or more active salespeople were not found" });
      }
    }

    const leads = await CustomerLead.find({
      _id: { $in: leadIds },
      showroom: req.showroom.id,
    }).sort({ createdAt: -1, updatedAt: -1 });

    const orderedLeadMap = new Map(leads.map((item) => [String(item._id), item]));
    const orderedUnassignedLeads = leadIds
      .map((leadId) => orderedLeadMap.get(leadId))
      .filter((item) => item && !item.assignedSalesPerson);

    if (!orderedUnassignedLeads.length) {
      return res.status(400).json({ message: "No unassigned leads available for bulk assignment" });
    }

    if (totalRequested > orderedUnassignedLeads.length) {
      return res.status(400).json({
        message: `Only ${orderedUnassignedLeads.length} unassigned lead${orderedUnassignedLeads.length === 1 ? " is" : "s are"} available right now`,
      });
    }

    let cursor = 0;
    const now = new Date();

    for (const assignment of assignments) {
      const salesPerson = salesPersonMap.get(assignment.salesPersonId);
      const leadSlice = orderedUnassignedLeads.slice(cursor, cursor + assignment.count);
      cursor += leadSlice.length;

      for (const lead of leadSlice) {
        lead.assignedSalesPerson = salesPerson._id;
        lead.assignedSalesPersonName = salesPerson.name;
        lead.assignedAt = now;
        await lead.save();
      }
    }

    return res.json({
      message: "Leads assigned successfully",
      assignedCount: totalRequested,
      remainingCount: orderedUnassignedLeads.length - totalRequested,
    });
  } catch (error) {
    console.log("Bulk assign customer leads error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:leadId/activity", protectShowroom, async (req, res) => {
  try {
    const leadId = normalizeText(req.params?.leadId);
    const outcome = normalizeText(req.body?.outcome).toLowerCase();
    const note = normalizeText(req.body?.note);
    const salesPersonId = normalizeText(req.body?.salesPersonId);
    const nextFollowUpAt = normalizeText(req.body?.nextFollowUpAt);
    const incrementCallAttempt = Boolean(req.body?.incrementCallAttempt);

    if (!outcome || !LEAD_OUTCOMES.has(outcome)) {
      return res.status(400).json({ message: "Valid lead outcome required" });
    }

    const lead = await CustomerLead.findOne({
      _id: leadId,
      showroom: req.showroom.id,
    });

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    let resolvedSalesPerson = null;
    const effectiveSalesPersonId = salesPersonId || lead.assignedSalesPerson?.toString?.() || "";

    if (effectiveSalesPersonId) {
      resolvedSalesPerson = await SalesPerson.findOne({
        _id: effectiveSalesPersonId,
        showroom: req.showroom.id,
      }).select("_id name mobile isActive");
    }

    const activityEntry = {
      outcome,
      note,
      salesPerson: resolvedSalesPerson?._id || null,
      salesPersonName: resolvedSalesPerson?.name || lead.assignedSalesPersonName || "",
      createdAt: new Date(),
    };

    lead.activities = [activityEntry, ...(Array.isArray(lead.activities) ? lead.activities : [])].slice(0, 20);
    lead.lastOutcome = outcome;
    lead.latestNote = note || lead.latestNote || "";

    if (incrementCallAttempt) {
      lead.callAttempts = Number(lead.callAttempts || 0) + 1;
      lead.lastCallAttemptAt = new Date();
    }

    if (nextFollowUpAt) {
      const parsedFollowUpAt = new Date(nextFollowUpAt);
      if (!Number.isNaN(parsedFollowUpAt.getTime())) {
        lead.nextFollowUpAt = parsedFollowUpAt;
      }
    } else if (req.body?.nextFollowUpAt === null || req.body?.nextFollowUpAt === "") {
      lead.nextFollowUpAt = null;
    }

    if (["interested", "call_back_later", "call_attempted", "busy", "not_answered"].includes(outcome)) {
      lead.status = "contacted";
    }

    if (["converted", "not_interested", "cold_customer", "wrong_number"].includes(outcome)) {
      lead.status = "closed";
    }

    await lead.save();
    await lead.populate("assignedSalesPerson", "name mobile isActive");
    await lead.populate("activities.salesPerson", "name mobile isActive");

    res.json({
      message: "Lead activity saved",
      data: toLeadResponse(lead),
    });
  } catch (error) {
    console.log("Update customer lead activity error", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

