const express = require("express");
const router = express.Router();
const SalesPerson = require("../models/SalesPerson");
const Showroom = require("../models/Showroom");
const protectShowroom = require("../middleware/showroomAuthMiddleware");


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





router.delete("/delete/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const salesperson = await SalesPerson.findByIdAndDelete(id);

    if (!salesperson) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

    res.json({ message: "Salesperson deleted successfully" });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;