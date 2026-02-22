
const showroomRoutes = require("./routes/showroomRoutes");
const express = require("express");
const cors = require("cors");
const qrRoutes = require("./routes/qrRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const startExpiryCron = require("./utils/cronJobs");


const dotenv = require("dotenv");
dotenv.config();


const connectDB = require("./config/db");
connectDB();

const app = express();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/showrooms", showroomRoutes);
app.use("/api/qr", require("./routes/qrRoutes"));
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/payment", require("./routes/payment"));


app.get("/", (req, res) => {
  res.send("ParkingQR API Running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryCron();   // 🔥 add this
});
console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID);