const mongoose = require("mongoose");

const offerLogSchema = new mongoose.Schema({

showroomId:{
type:mongoose.Schema.Types.ObjectId,
ref:"Showroom",
required:true
},

message:{
type:String,
required:true
}

},{timestamps:true});

module.exports = mongoose.model("OfferLog",offerLogSchema);