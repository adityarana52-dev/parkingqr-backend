const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
{
  user:{
    type: mongoose.Schema.Types.ObjectId,
    ref:"User"
  },

  message:{
    type:String,
    required:true
  },

  status:{
    type:String,
    enum:["pending","resolved"],
    default:"pending"
  }

},
{ timestamps:true }
);

module.exports = mongoose.model("Support", supportSchema);