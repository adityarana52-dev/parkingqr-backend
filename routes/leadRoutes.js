const express = require("express");
const router = express.Router();
const ShowroomLead = require("../models/ShowroomLead");
const { normalizeStateCode } = require("../utils/stateCodeMap");

function normalizeText(value = "") {
  return String(value || "").trim();
}


// showroom request connection
router.post("/request", async (req,res)=>{

try{

const normalizedStateCode = normalizeStateCode(req.body?.stateCode);

if(!normalizedStateCode){
return res.status(400).json({message:"Valid state selection required"});
}

const lead = await ShowroomLead.create({
...req.body,
city: normalizeText(req.body?.city),
name: normalizeText(req.body?.name),
contactPerson: normalizeText(req.body?.contactPerson),
addressLine1: normalizeText(req.body?.addressLine1),
addressLine2: normalizeText(req.body?.addressLine2),
phone: normalizeText(req.body?.phone),
pincode: normalizeText(req.body?.pincode),
stateCode: normalizedStateCode
});

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
