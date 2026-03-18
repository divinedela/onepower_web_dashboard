const { admin } = require("../config/firebaseAdmin");

const {
  listUserDevices,
  createNotification,
  listUserDevicesByUserIds,
  deleteUserDevicesByTokens,
} = require("../services/supabaseContentService");
const { evaluate } = require("./pushRuleEvaluator");
const logger = require("../config/logger");
const { recordSendSummary } = require("./pushMetricsService");

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
    const userTokenRows = await listUserDevices();

    // Save notification to database even when there are no valid tokens.
    await createNotification({
      recipient: "User",
      title: title,
      message: message,
    });

    const registrationTokens = [
      ...new Set(
        (userTokenRows || [])
          .map((row) => row.registration_token?.trim())
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
async function sendPushNotification(registrationTokens, title, message, data = {}) {
  try {
    const invalidTokens = new Set();
    const batches = chunk(registrationTokens, BATCH_SIZE);
    let totalSuccess = 0;
    let totalFailure = 0;

    for (const tokens of batches) {
      if (typeof admin.messaging().sendEachForMulticast === "function") {
        const resp = await admin.messaging().sendEachForMulticast({
          notification: { title, body: message },
          data,
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
          data,
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

    if (invalidTokens.size) {
      try {
        await deleteUserDevicesByTokens([...invalidTokens]);
      } catch (pruneErr) {
        console.error("Error pruning invalid tokens", pruneErr);
      }
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

async function sendDataMessage(registrationTokens, dataPayload = {}) {
  try {
    const invalidTokens = new Set();
    const batches = chunk(registrationTokens, BATCH_SIZE);
    for (const tokens of batches) {
      if (typeof admin.messaging().sendEachForMulticast === "function") {
        const resp = await admin.messaging().sendEachForMulticast({
          data: dataPayload,
          tokens,
        });
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code;
            if (INVALID_TOKEN_ERRORS.has(code)) invalidTokens.add(tokens[idx]);
          }
        });
      } else {
        const promises = tokens.map((token) =>
          admin.messaging().send({
            data: dataPayload,
            token,
          })
        );
        const results = await Promise.allSettled(promises);
        results.forEach((result, idx) => {
          if (result.status === "rejected") {
            const code = result.reason?.code;
            if (INVALID_TOKEN_ERRORS.has(code)) invalidTokens.add(tokens[idx]);
          }
        });
      }
    }
    if (invalidTokens.size) {
      try {
        await deleteUserDevicesByTokens([...invalidTokens]);
      } catch (pruneErr) {
        console.error("Error pruning invalid tokens (data message)", pruneErr);
      }
    }
  } catch (error) {
    console.error("Error sending data message:", error);
  }
}

async function sendToUsers(userIds = [], title, message) {
  if (!Array.isArray(userIds) || !userIds.length) return;
  const rows = await listUserDevicesByUserIds(userIds);
  const tokens = [
    ...new Set(
      rows.map((r) => r.registration_token?.trim()).filter(Boolean)
    ),
  ];
  if (!tokens.length) return;
  await createNotification({ recipient: "User", title, message });
  await sendPushNotification(tokens, title, message);
}

async function sendEvent(trigger, context = {}) {
  try {
    const evaluated = await evaluate(trigger, context);
    if (!evaluated.length) {
      logger.info("sendEvent: no matching rules", { trigger });
      return;
    }

    for (const item of evaluated) {
      const title = item.payload.title || context.title || "Notification";
      const message = item.payload.body || context.message || "";
      await createNotification({
        recipient: "User",
        title,
        message,
      });
      const dataPayload = {
        rule_id: item.rule.id || "",
        trigger,
        min_app_version: item.rule.min_app_version || "",
      };
      await sendPushNotification(item.tokens, title, message, dataPayload);
      logger.info("sendEvent: notification dispatched", {
        trigger,
        ruleId: item.rule.id,
        tokens: item.tokens.length,
      });
      await recordSendSummary({
        trigger,
        ruleId: item.rule.id,
        tokens: item.tokens.length,
        success: item.tokens.length, // assume success; detailed counts handled in sendPushNotification log
        failure: 0,
      });
    }
  } catch (err) {
    logger.error("sendEvent failed", { trigger, err_message: err.message });
  }
}

module.exports = {
  fetchAllUserToken,
  sendPushNotification,
  sendDataMessage,
  sendToUsers,
  sendEvent,
  sendAdminNotification,
};
