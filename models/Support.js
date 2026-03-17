const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({

user:{
type: mongoose.Schema.Types.ObjectId,
ref:"User"
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