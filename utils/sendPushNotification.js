const sendPushNotification = async (
  expoPushToken,
  title,
  body,
  data = {}
) => {
  if (!expoPushToken) {
    return { ok: false, error: "Missing expo push token" };
  }

  const message = {
    to: expoPushToken,
    sound: "default",
    title,
    body,
    data,
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log("Expo Response:", result);

    const isOk =
      response.ok &&
      (result?.data?.status === "ok" ||
        (Array.isArray(result?.data) &&
          result.data.every((item) => item?.status === "ok")));

    return {
      ok: Boolean(isOk),
      result,
    };
  } catch (error) {
    console.log("Push Send Error:", error);
    return {
      ok: false,
      error: error.message,
    };
  }
};

module.exports = sendPushNotification;
