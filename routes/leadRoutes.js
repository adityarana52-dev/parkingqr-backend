const express = require("express");
const router = express.Router();
const ShowroomLead = require("../models/ShowroomLead");


// showroom request connection
router.post("/request", async (req,res)=>{

try{

const lead = await ShowroomLead.create(req.body);

res.json({
message:"Connection request sent successfully"
});

}catch(error){

console.log("Lead error",error);
res.status(500).json({message:"Server error"});

}

});


// admin view leads
router.get("/", async (req,res)=>{

try{

const leads = await ShowroomLead.find()
.sort({createdAt:-1});

res.json(leads);

}catch(error){

console.log("Fetch leads error",error);
res.status(500).json({message:"Server error"});

}

});

module.exports = router;