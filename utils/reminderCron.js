const cron = require("node-cron");
const QrCode = require("../models/QrCode");
const sendPushNotification = require("./sendPushNotification");

cron.schedule("0 9 * * *", async () => {

console.log("Running daily reminder check");

const today = new Date();

const insuranceLimit = new Date();
insuranceLimit.setDate(today.getDate() + 7);

const serviceLimit = new Date();
serviceLimit.setDate(today.getDate() + 3);

try{

// INSURANCE REMINDERS
const insuranceVehicles = await QrCode.find({
insuranceExpiryDate: { $lte: insuranceLimit, $gte: today }
})
.populate("assignedTo")
.populate("showroom");

for(const qr of insuranceVehicles){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"}`,

`Insurance for ${qr.vehicleNumber} expires soon.

Please visit ${qr.showroom?.name || "nearest service center"} for renewal.`,

{ type: "insurance-reminder" }

);

}

}


// SERVICE REMINDERS
const serviceVehicles = await QrCode.find({
nextServiceDate: { $lte: serviceLimit, $gte: today }
})
.populate("assignedTo")
.populate("showroom");

for(const qr of serviceVehicles){

if(qr.assignedTo?.expoPushToken){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Service Reminder"}`,

`Vehicle ${qr.vehicleNumber} service is due soon.

Visit ${qr.showroom?.name || "your service center"} to schedule service.`,

{ type: "service-reminder" }

);

}

}

}catch(error){

console.log("Reminder Cron Error",error);

}

});