const mongoose = require("mongoose");

const showroomNotificationSchema = new mongoose.Schema(
{
showroom:{
type:mongoose.Schema.Types.ObjectId,
ref:"Showroom",
required:true
},

message:{
type:String,
required:true
},

month:Number,
year:Number

},
{timestamps:true}
);

module.exports = mongoose.model(
"ShowroomNotification",
showroomNotificationSchema
);