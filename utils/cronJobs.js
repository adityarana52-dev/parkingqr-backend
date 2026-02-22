const cron = require("node-cron");
const User = require("../models/User");
const sendPushNotification = require("./sendPushNotification");

const startExpiryCron = () => {
  // Daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("Running Professional Expiry Cron...");

    try {
      const users = await User.find({
        subscriptionActive: true,
        expoPushToken: { $ne: null },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const user of users) {
        const expiryDate = new Date(user.subscriptionExpiresAt);
        expiryDate.setHours(0, 0, 0, 0);
        
        // Difference in days
        const diffTime = expiryDate - today;
        const daysRemaining = Math.ceil(
          diffTime / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining === 7) {
          await sendPushNotification(
            user.expoPushToken,
            "Subscription Expiring in 7 Days",
            "Your subscription will expire in 7 days. Renew now to avoid interruption."
          );
        }

        if (daysRemaining === 1) {
          await sendPushNotification(
            user.expoPushToken,
            "Subscription Expiring Tomorrow",
            "Your subscription expires tomorrow. Please renew now."
          );
        }

        if (daysRemaining === 0) {
          await sendPushNotification(
            user.expoPushToken,
            "Subscription Expired",
            "Your subscription has expired. Renew to continue using the app."
          );
        }
      }

      console.log("Professional Expiry Cron Completed");

    } catch (error) {
      console.log("Cron Error:", error);
    }
  });
};

module.exports = startExpiryCron;