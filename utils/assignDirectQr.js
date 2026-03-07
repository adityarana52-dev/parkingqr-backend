const QrCode = require("../models/QrCode");

async function assignDirectQr(orderId,userId,quantity){

const availableQrs = await QrCode.find({
sourceType:"direct",
qrStatus:"generated",
isAssigned:false
}).limit(quantity);

if(availableQrs.length < quantity){
throw new Error("QR stock not available");
}

const qrIds = availableQrs.map(q=>q._id);

await QrCode.updateMany(
{_id:{$in:qrIds}},
{
orderId,
assignedTo:userId,
qrStatus:"assigned"
}
);

}

module.exports = assignDirectQr;