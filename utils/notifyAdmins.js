const User = require("../models/User");
const sendPushNotification = require("./sendPushNotification");

async function notifyAdmins(title, body, data = {}) {
  try {
    const admins = await User.find({
      role: "admin",
      expoPushToken: { $ne: null },
    }).select("expoPushToken");

    const uniqueTokens = Array.from(
      new Set(
        admins
          .map((admin) => String(admin.expoPushToken || "").trim())
          .filter(Boolean)
      )
    );

    if (!uniqueTokens.length) {
      return { sent: 0 };
    }

    const results = await Promise.allSettled(
      uniqueTokens.map((token) =>
        sendPushNotification(token, title, body, {
          type: "ADMIN_ALERT",
          ...data,
        })
      )
    );

    return {
      sent: results.filter(
        (item) => item.status === "fulfilled" && item.value?.ok
      ).length,
    };
  } catch (error) {
    console.log("Notify admins error", error);
    return { sent: 0 };
  }
}

module.exports = notifyAdmins;
