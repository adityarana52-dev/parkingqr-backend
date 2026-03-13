const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({

showroomId:{
type:mongoose.Schema.Types.ObjectId,
ref:"Showroom"
},

type:{
type:String,
enum:["insurance","service"]
},

message:{
type:String,
default:""
}

},{timestamps:true});

module.exports = mongoose.model("ReminderLog",reminderSchema);