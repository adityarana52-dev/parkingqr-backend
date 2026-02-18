const sendPushNotification = async (expoPushToken, title, body) => {
  const message = {
    to: expoPushToken,
    sound: "default",
    title: title,
    body: body,
  };

  try {
  const response = await fetch(
    "https://exp.host/--/api/v2/push/send",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    }
  );

  const data = await response.json();
  console.log("Expo Response:", data);

} catch (error) {
  console.log("Push Send Error:", error);
}
};

module.exports = sendPushNotification;
