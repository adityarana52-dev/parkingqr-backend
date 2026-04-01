const mongoose = require("mongoose");
const CommissionLedger = require("../models/CommissionLedger");
const CommissionWithdrawal = require("../models/CommissionWithdrawal");
const PayoutDetails = require("../models/PayoutDetails");
const Showroom = require("../models/Showroom");
const SalesPerson = require("../models/SalesPerson");
const { getMonthKey } = require("./commissionLedger");

function isClosedMonth(monthKey) {
  return monthKey && monthKey !== getMonthKey(new Date());
}

async function getMonthlyCommissionSummary({
  showroomId,
  monthKey,
  entityType,
  entityId = null,
}) {
  const match = {
    showroom: new mongoose.Types.ObjectId(showroomId),
    monthKey,
  };

  let amountField = "$showroomCommission";

  if (entityType === "salesperson") {
    match.salesPerson = new mongoose.Types.ObjectId(entityId);
    amountField = "$salesCommission";
  }

  const result = await CommissionLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        requestedAmount: { $sum: amountField },
        totalActivations: { $sum: 1 },
      },
    },
  ]);

  return {
    requestedAmount: result[0]?.requestedAmount || 0,
    totalActivations: result[0]?.totalActivations || 0,
  };
}

async function getPayoutDetailsForEntity(entityType, entityId) {
  return PayoutDetails.findOne({
    entityType,
    entityId,
    isActive: true,
  });
}

function serializePayoutDetails(details) {
  if (!details) {
    return null;
  }

  return {
    mode: details.mode,
    accountHolderName: details.accountHolderName,
    upiId: details.upiId,
    accountNumber: details.accountNumber,
    ifsc: details.ifsc,
    bankName: details.bankName,
    isActive: details.isActive,
  };
}

function maskValue(value, visibleDigits = 4) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  if (trimmed.length <= visibleDigits) {
    return trimmed;
  }

  return `${"*".repeat(trimmed.length - visibleDigits)}${trimmed.slice(-visibleDigits)}`;
}

function getPayoutSummary(details) {
  if (!details) {
    return {
      hasPayoutDetails: false,
      mode: null,
      accountHolderName: null,
      upiId: null,
      accountNumber: null,
      ifsc: null,
      bankName: null,
    };
  }

  return {
    hasPayoutDetails: true,
    mode: details.mode,
    accountHolderName: details.accountHolderName,
    upiId: details.mode === "upi" ? details.upiId : null,
    accountNumber: details.mode === "bank" ? maskValue(details.accountNumber) : null,
    ifsc: details.mode === "bank" ? details.ifsc : null,
    bankName: details.mode === "bank" ? details.bankName : null,
  };
}

async function createOrUpdateWithdrawalRequest({
  showroomId,
  entityType,
  entityId,
  salesPersonId = null,
  monthKey,
  requestNote = "",
}) {
  if (!isClosedMonth(monthKey)) {
    throw new Error("Current month payout cannot be requested");
  }

  const payoutDetails = await getPayoutDetailsForEntity(entityType, entityId);
  if (!payoutDetails) {
    throw new Error("Add payout details first");
  }

  const commissionSummary = await getMonthlyCommissionSummary({
    showroomId,
    monthKey,
    entityType,
    entityId: entityType === "salesperson" ? entityId : null,
  });

  if (!commissionSummary.requestedAmount) {
    throw new Error("No commission available for this month");
  }

  const existing = await CommissionWithdrawal.findOne({
    entityType,
    entityId,
    monthKey,
  });

  if (existing?.status === "pending") {
    throw new Error("Withdrawal request already pending");
  }

  if (existing?.status === "paid") {
    throw new Error("This month is already paid");
  }

  const payload = {
    showroom: showroomId,
    salesPerson: salesPersonId,
    requestedAmount: commissionSummary.requestedAmount,
    totalActivations: commissionSummary.totalActivations,
    payoutMode: payoutDetails.mode,
    payoutDetailsSnapshot: {
      accountHolderName: payoutDetails.accountHolderName,
      upiId: payoutDetails.upiId,
      accountNumber: payoutDetails.accountNumber,
      ifsc: payoutDetails.ifsc,
      bankName: payoutDetails.bankName,
    },
    requestNote: requestNote || "",
    status: "pending",
    requestedAt: new Date(),
    paymentNote: "",
    transactionRef: "",
    paidAt: null,
    rejectedAt: null,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    return existing;
  }

  return CommissionWithdrawal.create({
    entityType,
    entityId,
    monthKey,
    ...payload,
  });
}

async function getWithdrawalMapForShowroom(showroomId) {
  const withdrawals = await CommissionWithdrawal.find({
    showroom: showroomId,
  }).select(
    "entityType entityId monthKey requestedAmount status transactionRef paymentNote paidAt rejectedAt requestedAt"
  );

  const map = new Map();

  for (const withdrawal of withdrawals) {
    const key = `${withdrawal.entityType}:${withdrawal.entityId.toString()}:${withdrawal.monthKey}`;
    map.set(key, {
      _id: withdrawal._id,
      requestedAmount: withdrawal.requestedAmount,
      status: withdrawal.status,
      transactionRef: withdrawal.transactionRef,
      paymentNote: withdrawal.paymentNote,
      paidAt: withdrawal.paidAt,
      rejectedAt: withdrawal.rejectedAt,
      requestedAt: withdrawal.requestedAt,
    });
  }

  return map;
}

async function resolveEntityName(entityType, entityId) {
  if (entityType === "showroom") {
    const showroom = await Showroom.findById(entityId).select("name");
    return showroom?.name || "Showroom";
  }

  const salesPerson = await SalesPerson.findById(entityId)
    .select("name showroom")
    .populate("showroom", "name");

  return {
    name: salesPerson?.name || "Salesperson",
    showroomName: salesPerson?.showroom?.name || null,
  };
}

module.exports = {
  createOrUpdateWithdrawalRequest,
  getMonthlyCommissionSummary,
  getPayoutDetailsForEntity,
  getPayoutSummary,
  getWithdrawalMapForShowroom,
  isClosedMonth,
  resolveEntityName,
  serializePayoutDetails,
};
