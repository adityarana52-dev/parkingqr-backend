const cron = require("node-cron");
const User = require("../models/User");
const sendPushNotification = require("./sendPushNotification");

const startExpiryCron = () => {
  // Runs every day at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("Running Expiry Reminder Cron...");

    const today = new Date();

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const oneDayLater = new Date();
    oneDayLater.setDate(today.getDate() + 1);

    try {
      // 7 Day Reminder
      const sevenDayUsers = await User.find({
        subscriptionActive: true,
        subscriptionExpiresAt: {
          $gte: today,
          $lte: sevenDaysLater,
        },
        expoPushToken: { $ne: null },
      });

      for (const user of sevenDayUsers) {
        await sendPushNotification(
          user.expoPushToken,
          "Subscription Expiring Soon",
          "Your subscription will expire in 7 days. Please renew."
        );
      }

      // 1 Day Reminder
      const oneDayUsers = await User.find({
        subscriptionActive: true,
        subscriptionExpiresAt: {
          $gte: today,
          $lte: oneDayLater,
        },
        expoPushToken: { $ne: null },
      });

      for (const user of oneDayUsers) {
        await sendPushNotification(
          user.expoPushToken,
          "Subscription Expiring Tomorrow",
          "Your subscription expires tomorrow. Renew now."
        );
      }

      // Expired Today
      const expiredUsers = await User.find({
        subscriptionActive: true,
        subscriptionExpiresAt: { $lt: today },
        expoPushToken: { $ne: null },
      });

      for (const user of expiredUsers) {
        await sendPushNotification(
          user.expoPushToken,
          "Subscription Expired",
          "Your subscription has expired. Please renew to continue."
        );
      }

      console.log("Expiry Reminder Cron Completed");

    } catch (error) {
      console.log("Cron Error:", error);
    }
  });
};

module.exports = startExpiryCron;