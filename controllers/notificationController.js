// Importing models
const notificationModel = require("../model/notificationModel");
const currencyTimezoneModel = require("../model/currencyTimezoneModel");
const { fetchAllUserToken } = require("../services/sendNotification");
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// load notification    
const loadNotification = async (req, res) => {
    try {
        // check if the user is verified
        await verifyAdminAccess(req, res, async () => {

        // fetch notification
        const notifications = await notificationModel.find({ recipient: "Admin" }).sort({ createdAt: -1 });

        // Update the notifications to mark them as read
        await notificationModel.updateMany({ recipient: "Admin" }, { $set: { is_read: true } });

        // fetch currency timezone
        const timezones = await currencyTimezoneModel.findOne();

            return res.render("notification", { notifications, timezones });
        });

    } catch (error) {
        console.log("error load notification", error);
        req.flash("error", "Failed to load notification");
        return res.redirect(process.env.BASE_URL + "notification");
    }
}

// load send notification
const loadSendNotification = async (req, res) => {

    try {

        // fetch all sending notification
        const commonNotification = await notificationModel.find({ recipient: "User" });

        // fetch currency timezone
        const timezones = await currencyTimezoneModel.findOne();

        return res.render("pushNotification", { commonNotification, timezones });

    } catch (error) {
        console.log("error load send notification", error);
        req.flash("error", "Failed to load send notification");
        return res.redirect(process.env.BASE_URL + "push-notification");
    }
}

// send notification
const sendAllUserNotification = async (req, res) => {
    try {
        // Extract data from the request
        const title = req.body.title;
        const message = req.body.message.replace(/"/g, '&quot;');

        // send notification
        await fetchAllUserToken(title, message);

        req.flash("success", "Notification sent successfully");
        return res.redirect(process.env.BASE_URL + "push-notification");

    } catch (error) {
        console.log("error send all user notification", error);
        req.flash("error", "Failed to send notification");
        return res.redirect(process.env.BASE_URL + "push-notification");
    }
}

// get all notification
const notification = async (req, res) => {

    try {

        // fetch all latest notification
        const notifications = await notificationModel.find({ recipient: "Admin" }).sort({ createdAt: -1 }).limit(10);

        // fetch store
        const timezones = await currencyTimezoneModel.findOne({}, { timezone: 1 })

        const result = {
            notifications: notifications,
            timezones: timezones || {}
        };

        return res.json(result);

    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

module.exports = {

    loadNotification,
    loadSendNotification,
    sendAllUserNotification,
    notification
};
