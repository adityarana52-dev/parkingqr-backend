const express = require("express");
const router = express.Router();
const SalesPerson = require("../models/SalesPerson");
const Showroom = require("../models/Showroom");
const protectShowroom = require("../middleware/showroomAuthMiddleware");
const PayoutDetails = require("../models/PayoutDetails");
const {
  getPayoutDetailsForEntity,
  getPayoutSummary,
  serializePayoutDetails,
} = require("../utils/withdrawals");


// ✅ Create Sales Person
router.post("/create", protectShowroom, async (req, res) => {
  try {

    const { name, mobile } = req.body;

    const showroomId = req.showroom.id;

    if (!name) {
      return res.status(400).json({
        message: "Name required"
      });
    }

    const salesPerson = await SalesPerson.create({
      name,
      mobile,
      showroom: showroomId
    });

    res.status(201).json(salesPerson);

  } catch (error) {

    console.log("Create SalesPerson Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }
});

router.get("/my-team", protectShowroom, async (req, res) => {

  try {

    const salesPersons = await SalesPerson.find({
      showroom: req.showroom.id,
      isActive: true
    }).select("name mobile totalActivations totalEarnings");

    res.json(salesPersons);

  } catch (error) {

    console.log("Fetch Team Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});



router.get("/manage-team", protectShowroom, async (req, res) => {

  try {

    const salesPersons = await SalesPerson.find({
      showroom: req.showroom.id
    }).select("name mobile isActive totalActivations totalEarnings");

    const payoutDetailsList = await PayoutDetails.find({
      entityType: "salesperson",
      showroom: req.showroom.id,
      isActive: true,
    }).select("entityId mode accountHolderName upiId accountNumber ifsc bankName isActive");

    const payoutMap = new Map(
      payoutDetailsList.map((details) => [details.entityId.toString(), details])
    );

    const response = salesPersons.map((salesPerson) => ({
      ...salesPerson.toObject(),
      payoutSummary: getPayoutSummary(payoutMap.get(salesPerson._id.toString()) || null),
    }));

    res.json(response);

  } catch (error) {

    console.log("Manage Team Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.get("/payout-details/:id", protectShowroom, async (req, res) => {
  try {
    const salesPerson = await SalesPerson.findOne({
      _id: req.params.id,
      showroom: req.showroom.id,
    }).select("_id");

    if (!salesPerson) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

    const payoutDetails = await getPayoutDetailsForEntity("salesperson", salesPerson._id);

    res.json({
      payoutDetails: serializePayoutDetails(payoutDetails),
      payoutSummary: getPayoutSummary(payoutDetails),
    });
  } catch (error) {
    console.log("Salesperson payout fetch error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/payout-details/:id", protectShowroom, async (req, res) => {
  try {
    const salesPerson = await SalesPerson.findOne({
      _id: req.params.id,
      showroom: req.showroom.id,
    }).select("_id");

    if (!salesPerson) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

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
        entityType: "salesperson",
        entityId: salesPerson._id,
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
    console.log("Salesperson payout save error", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/deactivate/:id", protectShowroom, async (req, res) => {

  try {

    const { id } = req.params;

    const salesPerson = await SalesPerson.findOneAndUpdate(
      {
        _id: id,
        showroom: req.showroom.id
      },
      { isActive: false },
      { new: true }
    );

    if (!salesPerson) {
      return res.status(404).json({
        message: "Sales person not found"
      });
    }

    res.json({
      message: "Sales person deactivated"
    });

  } catch (error) {

    console.log("Deactivate Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});

router.patch("/reactivate/:id", protectShowroom, async (req, res) => {

  try {

    const { id } = req.params;

    const salesPerson = await SalesPerson.findOneAndUpdate(
      {
        _id: id,
        showroom: req.showroom.id
      },
      { isActive: true },
      { new: true }
    );

    if (!salesPerson) {
      return res.status(404).json({
        message: "Sales person not found"
      });
    }

    res.json({
      message: "Sales person reactivated"
    });

  } catch (error) {

    console.log("Reactivate Error:", error);

    res.status(500).json({
      message: "Server error"
    });

  }

});


// ✅ Get Sales Persons By Showroom (For Dropdown)
router.get("/by-showroom/:showroomId", async (req, res) => {
  try {
    const { showroomId } = req.params;

    const salesPersons = await SalesPerson.find({
      showroom: showroomId,
      isActive: true,
    }).select("name");

    res.json(salesPersons);

  } catch (error) {
    console.log("Fetch SalesPersons Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});





router.delete("/delete/:id", protectShowroom, async (req, res) => {
  try {

    const { id } = req.params;

    const salesperson = await SalesPerson.findOneAndUpdate(
      {
        _id: id,
        showroom: req.showroom.id
      },
      {
        isActive: false
      },
      { new: true }
    );

    if (!salesperson) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

    res.json({
          message: "Salesperson deactivated",
          isActive: false
        });

  } catch (error) {

    console.log("Soft delete error:", error);

    res.status(500).json({ message: "Server error" });

  }
});

module.exports = router;
