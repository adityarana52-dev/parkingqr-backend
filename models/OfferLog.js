const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({

showroomId:{
type:mongoose.Schema.Types.ObjectId,
ref:"Showroom"
},

message:String, 

createdAt:{
type:Date,
default:Date.now
}

},{timestamps:true});

module.exports = mongoose.model("OfferLog",offerSchema);