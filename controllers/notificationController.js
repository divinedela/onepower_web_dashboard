const { verifyAdminAccess } = require("../config/verification");
const { fetchAllUserToken } = require("../services/sendNotification");
const {
  listNotifications,
  createNotification,
  getCurrencyTimezone,
} = require("../services/supabaseContentService");

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
    const notifications = await listNotifications();
    const timezones = await getCurrencyTimezone();
    const result = {
      notifications,
      timezones: timezones || {},
    };
    return res.json(result);
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  loadNotification,
  loadSendNotification,
  sendAllUserNotification,
  notification,
};
