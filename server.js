
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

const QR = require("./models/QrCode");   // path adjust karo agar different ho
const User = require("./models/User");

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

// 🔥 YAHAN ADD KARO
app.get("/scan/:qrId", async (req, res) => {
  try {
    const qrIdParam = req.params.qrId;
    console.log("SCAN HIT:", qrIdParam);

    const qr = await QR.findOne({ qrId: qrIdParam });

    if (!qr) {
      return res.send("QR NOT FOUND IN DATABASE");
    }

    return res.send(`
      <h2>QR FOUND</h2>
      <p>QR ID: ${qr.qrId}</p>
      <p>Vehicle: ${qr.vehicleNumber || "N/A"}</p>
    `);

  } catch (error) {
    console.log("SCAN ERROR:", error);
    return res.send("SERVER ERROR - CHECK LOGS");
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryCron();   // 🔥 add this
});
console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID);