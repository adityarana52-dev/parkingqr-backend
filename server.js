
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

app.get("/scan/:qrId", async (req, res) => {
  try {
    const qrIdParam = req.params.qrId;

    const qr = await QR.findOne({ qrId: qrIdParam })
      .populate("assignedTo")
      .populate("showroom");

    if (!qr) {
      return res.send("QR NOT FOUND");
    }

    if (!qr.assignedTo) {
      return res.send("QR NOT ACTIVATED YET");
    }

    const user = qr.assignedTo;

    let maskedNumber = "Not Available";

    if (user.mobile && user.mobile.length >= 10) {
      maskedNumber =
        user.mobile.substring(0, 2) +
        "XXXXXX" +
        user.mobile.substring(user.mobile.length - 2);
    }

    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Parking QR</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
      background: #f4f6f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    .container {
      width: 95%;
      max-width: 420px;
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.08);
      text-align: center;
    }

    .icon {
      font-size: 40px;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0 0 20px 0;
      font-weight: 600;
    }

    .info {
      margin-bottom: 12px;
      font-size: 15px;
      color: #444;
    }

    .label {
      font-weight: 600;
      color: #111;
    }

    .button {
      width: 100%;
      padding: 14px;
      margin-top: 14px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .move-btn {
      background: #111;
      color: white;
    }

    .call-btn {
      background: #16a34a;
      color: white;
    }

    .footer {
      margin-top: 18px;
      font-size: 13px;
      color: #777;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="card">
      <div class="icon">🚗</div>
      <h2>Vehicle Details</h2>

      <div class="info">
        <span class="label">Vehicle Number:</span><br>
        ${qr.vehicleNumber || "N/A"}
      </div>

      <div class="info">
        <span class="label">Showroom:</span><br>
        ${qr.showroom?.name || "N/A"}
      </div>

      <div class="info">
        <span class="label">Owner Contact:</span><br>
        ${maskedNumber}
      </div>

      <form method="POST" action="/api/qr/move-request">
        <input type="hidden" name="qrId" value="${qr.qrId}" />
        <button class="button move-btn">
          🔔 Request Owner to Move
        </button>
      </form>

      <button class="button call-btn" onclick="callOwner()">
        📞 Call Owner
      </button>

      <div class="footer">
        Please contact politely if the vehicle needs to be moved.
      </div>
    </div>
  </div>

  <script>
    function sendMoveRequest() {
      fetch("/api/qr/move-request/${qr.qrId}", {
        method: "POST"
      })
      .then(() => alert("Move request sent successfully"))
      .catch(() => alert("Something went wrong"));
    }

   
  </script>

  <script>
  function callOwner() {
    const caller = prompt("Enter your mobile number (with +91) to connect call:");

    if (!caller) return;

    fetch("/api/qr/call/${qr.qrId}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ callerNumber: caller })
    })
    .then(res => res.json())
    .then(data => alert("Call connecting..."))
    .catch(() => alert("Call failed"));
  }
</script>

</body>
</html>
`);

  } catch (error) {
    console.log("SCAN ERROR:", error);
    return res.send("SERVER ERROR");
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryCron();   // 🔥 add this
});
console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID);