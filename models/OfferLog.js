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
},

expireAt:{
type:Date,
default:()=>{
return new Date(Date.now() + 30*24*60*60*1000); // 30 days
},
index:{expires:0}
}

},{timestamps:true});

module.exports = mongoose.model("OfferLog",offerLogSchema);