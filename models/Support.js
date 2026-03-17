const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({

user:{
type: mongoose.Schema.Types.ObjectId,
ref:"User",
default:null
},

showroom:{
type: mongoose.Schema.Types.ObjectId,
ref:"Showroom",
default:null
},

messages:[
{
text:{
type:String,
required:true
},
sender:{
type:String,
default:"user"
},
createdAt:{
type:Date,
default:Date.now
}
}
],

status:{
type:String,
default:"open"
}

},{timestamps:true});

module.exports = mongoose.model("Support", supportSchema);