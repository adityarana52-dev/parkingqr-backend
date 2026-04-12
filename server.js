
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
const BRAND_LOGO_DATA_URI =
  "data:image/png;base64,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";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/showrooms", showroomRoutes);
app.use("/api/qr", require("./routes/qrRoutes"));
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/service-notes", require("./routes/serviceNoteRoutes"));
app.use("/api/payment", require("./routes/payment"));

app.use("/api/salesperson", require("./routes/salesPersonRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));
require("./utils/reminderCron");


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

    if (qr.qrStatus !== "activated" || !qr.assignedTo) {
  return res.send("QR Not Activated Yet");
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
  <title>carbiQR</title>
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

    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 16px;
    }

    .brand-logo {
      width: 62px;
      height: 62px;
      object-fit: contain;
      border-radius: 18px;
      margin-bottom: 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.08);
      background: #fff;
    }

    .brand-name {
      font-size: 22px;
      font-weight: 800;
      color: #111;
      letter-spacing: 0.2px;
    }

    .brand-subtitle {
      margin-top: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      letter-spacing: 1px;
      text-transform: uppercase;
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

      .tow-btn {
  background: #B91C1C;
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
      <div class="brand">
        <img src="${BRAND_LOGO_DATA_URI}" alt="carbiQR" class="brand-logo" />
        <div class="brand-name">carbiQR</div>
        <div class="brand-subtitle">Vehicle Assistance</div>
      </div>
      <div class="icon">🚗</div>
      <h2>Vehicle Details</h2>

      <div class="info">
        <span class="label">Vehicle Number:</span><br>
        ${qr.vehicleNumber || "NEW VEHICLE"}
      </div>

      <div class="info">
        <span class="label">Showroom:</span><br>
        ${qr.showroom?.name || "N/A"}
      </div>

      <div class="info">
        <span class="label">Owner Contact:</span><br>
        ${maskedNumber}
      </div>

      <form id="moveForm">
          <button type="submit" class="button move-btn">
            🔔 Request Owner to Move
          </button>
        </form>

        <form id="towForm">
          <button type="submit" class="button tow-btn">
            🚨 Towing Your Vehicle
          </button>
        </form>

        <script>
            let cachedLat = null;
            let cachedLng = null;
            let cachedAccuracy = null;

            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                function(position) {
                  cachedLat = position.coords.latitude;
                  cachedLng = position.coords.longitude;
                  cachedAccuracy = position.coords.accuracy;
                },
                function() {
                  cachedLat = null;
                  cachedLng = null;
                  cachedAccuracy = null;
                },
                {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 0
                }
              );
            }

            function sendRequest(type) {
              fetch("/api/qr/move-request", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  qrId: "${qr.qrId}",
                  type: type,
                  latitude: cachedLat,
                  longitude: cachedLng,
                  accuracy: cachedAccuracy
                })
              })
              .then(async (response) => {
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                  document.body.innerHTML =
                    "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                    "<h2>Please Wait</h2>" +
                    "<p>" + (data.message || "A request was already sent recently. Please wait 2 minutes before sending another request.") + "</p>" +
                    "</div>";
                  return;
                }

                document.body.innerHTML =
                  "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                  "<h2>Request Sent</h2>" +
                  "<p>" + (data.message || "The vehicle owner has been notified.") + "</p>" +
                  "</div>";
              })
              .catch(() => {
                document.body.innerHTML =
                  "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                  "<h2>Error</h2>" +
                  "<p>Something went wrong. Please try again.</p>" +
                  "</div>";
              });
            }

            document.getElementById("moveForm").addEventListener("submit", function(e) {
              e.preventDefault();
              sendRequest("move");
            });

            document.getElementById("towForm").addEventListener("submit", function(e) {
              e.preventDefault();
              sendRequest("tow");
            });
            </script>

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
