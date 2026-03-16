const { admin } = require("../config/firebaseAdmin");

// Importing models
const userNotificationModel = require("../model/userNotificationModel");
const notificationModel = require("../model/notificationModel");

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/mismatched-credential",
]);
const BATCH_SIZE = 500;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// fetch all user toekn
async function fetchAllUserToken(title, message) {
  try {
    const userToken = await userNotificationModel.find(
      { registrationToken: { $exists: true, $ne: "" } },
      { registrationToken: 1 }
    );

    // Save notification to database even when there are no valid tokens.
    await new notificationModel({
      recipient: "User",
      title: title,
      message: message,
    }).save();

    const registrationTokens = [
      ...new Set(
        userToken
          .map((token) => token.registrationToken?.trim())
          .filter(Boolean)
      ),
    ];

    if (!registrationTokens.length) return;
    await sendPushNotification(registrationTokens, title, message);
  } catch (error) {
    console.log("error fetch user registration token", error);
  }
}

// Firebase Push Notification
async function sendPushNotification(registrationTokens, title, message) {
  try {
    const invalidTokens = new Set();
    const batches = chunk(registrationTokens, BATCH_SIZE);
    let totalSuccess = 0;
    let totalFailure = 0;

    for (const tokens of batches) {
      if (typeof admin.messaging().sendEachForMulticast === "function") {
        const resp = await admin.messaging().sendEachForMulticast({
          notification: { title, body: message },
          tokens,
        });
        totalSuccess += resp.successCount;
        totalFailure += resp.failureCount;

        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code;
            if (INVALID_TOKEN_ERRORS.has(code)) invalidTokens.add(tokens[idx]);
          }
        });
        continue;
      }

      const fallbackPromises = tokens.map((token) =>
        admin.messaging().send({
          notification: { title, body: message },
          token,
        })
      );
      const fallbackResults = await Promise.allSettled(fallbackPromises);
      fallbackResults.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          totalSuccess += 1;
          return;
        }
        totalFailure += 1;
        const code = result.reason?.code;
        if (INVALID_TOKEN_ERRORS.has(code)) invalidTokens.add(tokens[idx]);
      });
    }

    if (invalidTokens.size > 0) {
      await userNotificationModel.deleteMany({
        registrationToken: { $in: [...invalidTokens] },
      });
    }

    console.log("Notifications send summary:", {
      totalTokens: registrationTokens.length,
      totalSuccess,
      totalFailure,
      invalidTokensPruned: invalidTokens.size,
    });
  } catch (error) {
    console.error("Error sending notifications:", error);
  }
}

// Function to send notification to a admin
async function sendAdminNotification(title, message) {
  try {
    // Save admin notification
    await new notificationModel({ title, recipient: "Admin", message }).save();
  } catch (error) {
    console.error("Error sending admin notification:", error);
  }
}

module.exports = {
  fetchAllUserToken,
  sendPushNotification,
  sendAdminNotification,
};
