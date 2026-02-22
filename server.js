
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
    const { qrId } = req.params;

    const qr = await QR.findOne({ qrId }).populate("assignedTo");

    if (!qr) {
      return res.status(404).send("<h1>QR Not Found</h1>");
    }

    const user = qr.assignedTo;

    if (!user) {
      return res.send("<h1>QR Not Activated Yet</h1>");
    }

    const maskedNumber =
      user.mobile.slice(0, 2) +
      "XXXXXX" +
      user.mobile.slice(-2);

    res.send(`
      <html>
        <head>
          <title>Parking QR</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: Arial; text-align: center; padding: 20px; }
            .card { border: 1px solid #ddd; padding: 20px; border-radius: 10px; margin-top: 20px; }
            button { padding: 12px 20px; margin: 10px; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; }
            .move { background-color: black; color: white; }
            .call { background-color: green; color: white; }
          </style>
        </head>
        <body>
          <h2>Vehicle Details</h2>
          <div class="card">
            <p><strong>Vehicle:</strong> ${qr.vehicleNumber || "N/A"}</p>
            <p><strong>Showroom:</strong> ${qr.showroom || "N/A"}</p>
            <p><strong>Owner:</strong> ${maskedNumber}</p>

            <button class="move" onclick="sendMoveRequest()">
              Request Owner to Move
            </button>

            <button class="call" onclick="callOwner()">
              Call Owner
            </button>
          </div>

          <script>
            function sendMoveRequest() {
              fetch("/api/qr/move-request/${qrId}", { method: "POST" })
                .then(() => alert("Move request sent"));
            }

            function callOwner() {
              window.location.href = "tel:${user.mobile}";
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.log(error);
    res.status(500).send("<h1>Server Error</h1>");
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryCron();   // 🔥 add this
});
console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID);