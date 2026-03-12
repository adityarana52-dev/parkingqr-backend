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

function getDaysDifference(date1, date2){

const diffTime = date1 - date2;

return Math.ceil(diffTime / (1000 * 60 * 60 * 24));

}

try{

// INSURANCE REMINDERS
const insuranceVehicles = await QrCode.find({
insuranceExpiryDate: { $ne: null }
})
.populate("assignedTo")
.populate("showroom");

for(const qr of insuranceVehicles){

if(!qr.assignedTo?.expoPushToken) continue;

const expiryDate = new Date(qr.insuranceExpiryDate);

const daysLeft = getDaysDifference(expiryDate, today);

if([30,7,3,1].includes(daysLeft)){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Vehicle Reminder"}`,

`Insurance for ${qr.vehicleNumber} expires in ${daysLeft} day(s).

Please visit ${qr.showroom?.name || "nearest service center"} for renewal.`,

{type:"insurance-reminder"}

);

}

}


// SERVICE REMINDERS
const serviceVehicles = await QrCode.find({
nextServiceDate: { $ne: null }
})
.populate("assignedTo")
.populate("showroom");

for(const qr of serviceVehicles){

if(!qr.assignedTo?.expoPushToken) continue;

const serviceDate = new Date(qr.nextServiceDate);

const daysLeft = getDaysDifference(serviceDate, today);

if([30,7,3,1].includes(daysLeft)){

await sendPushNotification(

qr.assignedTo.expoPushToken,

`${qr.showroom?.name || "Service Reminder"}`,

`Vehicle ${qr.vehicleNumber} service is due in ${daysLeft} day(s).

Visit ${qr.showroom?.name || "your service center"} to schedule service.`,

{type:"service-reminder"}

);

}

}

}catch(error){

console.log("Reminder Cron Error",error);

}

});