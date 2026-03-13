const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
    },
    subscriptionActive: {
      type: Boolean,
      default: false,
    },

    subscriptionExpiresAt: {
        type: Date,
      },
      
    expoPushToken: {
  type: String,
},

city:{
type:String,
lowercase:true,
trim:true,
default:null
},

  role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
