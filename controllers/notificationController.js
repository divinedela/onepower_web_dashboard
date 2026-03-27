const { verifyAdminAccess } = require("../config/verification");
const { fetchAllUserToken } = require("../services/sendNotification");
const { listNotifications, createNotification } = require("../services/supabaseContentService");
const { getCurrencyTimezone } = require("../services/supabaseCurrencyService");

const loadNotification = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const notifications = await listNotifications();
      const timezones = await getCurrencyTimezone();
      // mark as read (best-effort)
      // Supabase REST doesn't support bulk update here without RLS; skipped for now.
      return res.render("notification", { notifications, timezones });
    });
  } catch (error) {
    console.log("error load notification", error);
    req.flash("error", "Failed to load notification");
    return res.redirect(process.env.BASE_URL + "notification");
  }
};

const loadSendNotification = async (_req, res) => {
  try {
    const commonNotification = await listNotifications();
    const timezones = await getCurrencyTimezone();
    return res.render("pushNotification", { commonNotification, timezones });
  } catch (error) {
    console.log("error load send notification", error);
    req.flash("error", "Failed to load send notification");
    return res.redirect(process.env.BASE_URL + "push-notification");
  }
};

const sendAllUserNotification = async (req, res) => {
  try {
    const title = req.body.title;
    const message = (req.body.message || "").replace(/"/g, '&quot;');

    // send push
    await fetchAllUserToken(title, message);

    // persist notification record
    await createNotification({
      recipient: "User",
      title,
      message,
      is_read: false,
    });

    req.flash("success", "Notification sent successfully");
    return res.redirect(process.env.BASE_URL + "push-notification");
  } catch (error) {
    console.log("error send all user notification", error);
    req.flash("error", "Failed to send notification");
    return res.redirect(process.env.BASE_URL + "push-notification");
  }
};

const notification = async (_req, res) => {
  try {
    let notifications = [];
    let timezones = {};
    let hadError = false;

    try {
      notifications = await listNotifications();
    } catch (e) {
      console.log("notification list error", e?.response?.status || e.message);
      hadError = true;
    }

    try {
      timezones = (await getCurrencyTimezone()) || {};
    } catch (e) {
      console.log("currency timezone fetch error", e?.response?.status || e.message);
      hadError = true;
    }

    return res.json({
      notifications,
      timezones,
      error: hadError ? "Unable to load notifications" : undefined,
    });
  } catch (error) {
    console.log("notification fetch error", error.message);
    // Return a safe, empty payload so the UI does not break
    return res.status(200).json({
      notifications: [],
      timezones: {},
      error: "Unable to load notifications",
    });
  }
};

module.exports = {
  loadNotification,
  loadSendNotification,
  sendAllUserNotification,
  notification,
};
