const CommissionLedger = require("../models/CommissionLedger");
const QrCode = require("../models/QrCode");
const Showroom = require("../models/Showroom");
const SalesPerson = require("../models/SalesPerson");

const APP_TIME_ZONE = "Asia/Kolkata";

function getTimeZoneParts(date, timeZone = APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return values;
}

function getMonthKey(date, timeZone = APP_TIME_ZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${parts.month}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const monthIndex = Number(month) - 1;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return `${monthNames[monthIndex] || month} ${year}`;
}

function calculateCommission(entity, subscriptionAmount) {
  if (!entity) {
    return 0;
  }

  if (entity.commissionType === "fixed") {
    return entity.commissionValue || 0;
  }

  if (entity.commissionType === "percentage") {
    return Math.round((subscriptionAmount * (entity.commissionValue || 0)) / 100);
  }

  return 0;
}

function getSubscriptionAmount(user) {
  return user?.subscriptionPrice || 299;
}

async function createCommissionEntry({
  qr,
  user = null,
  showroomData = null,
  salesPersonData = null,
  activatedAt = null,
}) {
  if (!qr?.showroom || !qr?._id) {
    return null;
  }

  const existingEntry = await CommissionLedger.findOne({ qr: qr._id }).select("_id");
  if (existingEntry) {
    return existingEntry;
  }

  const resolvedActivatedAt = activatedAt || qr.activatedAt || qr.updatedAt || qr.createdAt || new Date();
  const subscriptionAmount = getSubscriptionAmount(user);
  const showroomCommission = calculateCommission(showroomData, subscriptionAmount);
  const salesCommission = calculateCommission(salesPersonData, subscriptionAmount);

  return CommissionLedger.create({
    showroom: qr.showroom._id ? qr.showroom._id : qr.showroom,
    salesPerson: salesPersonData?._id || qr.salesPerson || null,
    qr: qr._id,
    qrId: qr.qrId,
    user: user?._id || qr.assignedTo || null,
    vehicleNumber: qr.vehicleNumber || null,
    activatedAt: resolvedActivatedAt,
    monthKey: getMonthKey(resolvedActivatedAt),
    subscriptionAmount,
    showroomCommission,
    salesCommission,
    showroomCommissionType: showroomData?.commissionType || null,
    showroomCommissionValue: showroomData?.commissionValue ?? null,
    salesCommissionType: salesPersonData?.commissionType || null,
    salesCommissionValue: salesPersonData?.commissionValue ?? null,
  });
}

async function ensureCommissionEntriesForShowroom(showroomId) {
  const activatedQrs = await QrCode.find({
    showroom: showroomId,
    qrStatus: "activated",
  }).select("_id qrId showroom salesPerson assignedTo vehicleNumber activatedAt updatedAt createdAt");

  if (!activatedQrs.length) {
    return;
  }

  const existingEntries = await CommissionLedger.find({
    qr: { $in: activatedQrs.map((qr) => qr._id) },
  }).select("qr");

  const existingQrIds = new Set(existingEntries.map((entry) => entry.qr.toString()));
  const missingQrs = activatedQrs.filter((qr) => !existingQrIds.has(qr._id.toString()));

  if (!missingQrs.length) {
    return;
  }

  const showroomData = await Showroom.findById(showroomId).select("commissionType commissionValue");
  if (!showroomData) {
    return;
  }

  const salesPersonIds = [
    ...new Set(
      missingQrs
        .map((qr) => (qr.salesPerson ? qr.salesPerson.toString() : null))
        .filter(Boolean)
    ),
  ];

  const salesPersons = salesPersonIds.length
    ? await SalesPerson.find({
        _id: { $in: salesPersonIds },
      }).select("commissionType commissionValue")
    : [];

  const salesPersonMap = new Map(
    salesPersons.map((salesPerson) => [salesPerson._id.toString(), salesPerson])
  );

  for (const qr of missingQrs) {
    const fallbackActivatedAt = qr.activatedAt || qr.updatedAt || qr.createdAt || new Date();

    if (!qr.activatedAt) {
      await QrCode.updateOne(
        { _id: qr._id, activatedAt: null },
        { $set: { activatedAt: fallbackActivatedAt } }
      );
      qr.activatedAt = fallbackActivatedAt;
    }

    await createCommissionEntry({
      qr,
      showroomData,
      salesPersonData: qr.salesPerson
        ? salesPersonMap.get(qr.salesPerson.toString()) || null
        : null,
      activatedAt: fallbackActivatedAt,
    });
  }
}

module.exports = {
  APP_TIME_ZONE,
  calculateCommission,
  createCommissionEntry,
  ensureCommissionEntriesForShowroom,
  formatMonthLabel,
  getMonthKey,
  getSubscriptionAmount,
};
