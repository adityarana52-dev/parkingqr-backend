const mongoose = require("mongoose");

const showroomLeadSchema = new mongoose.Schema({

name:{
type:String,
required:true
},

contactPerson:{
type:String,
required:true
},

phone:{
type:String,
required:true
},

city:{
type:String,
required:true
},

 vehicleType: {
      type: String,
      enum: ["car","bike","scooty","auto","other"],
      
    },

vehicleBrands:{
type:[String],
default:[]
},

vehicleBrandKeys:{
type:[String],
default:[]
},

stateCode:{
type:String,
required:true
},

addressLine1:String,
addressLine2:String,
pincode:String,

status:{
type:String,
enum:["pending","contacted","converted"],
default:"pending"
}

},{timestamps:true});

module.exports = mongoose.model("ShowroomLead", showroomLeadSchema);
