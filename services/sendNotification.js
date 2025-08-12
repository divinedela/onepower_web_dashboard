// Importing required modules 
const admin = require('firebase-admin');
const moment = require("moment");

// important firebase project
const serviceAccount = require("../firebase.json");

// Importing models
const userNotificationModel = require("../model/userNotificationModel");
const notificationModel = require("../model/notificationModel");

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// fetch all user toekn
async function fetchAllUserToken(title, message) {

    try {

        const userToken = await userNotificationModel.find({});

        if (userToken.length > 0) {

            // Save notification to database
            await new notificationModel({ recipient: "User", title: title, message: message }).save();

            // Retrieve registration token for the user
            const registrationTokens = userToken.map(token => token.registrationToken);

            // Send push notification
            await sendPushNotification(registrationTokens, title, message);
        }

    } catch (error) {
        console.log("error fetch user registration token", error);
    }
}


// Firebase Push Notification
async function sendPushNotification(registrationTokens, title, message) {

    const promises = registrationTokens.map(token => {

        const messagePayload = {
            notification: {
                title: title,
                body: message,
            },
            token: token,
        };

        return admin.messaging().send(messagePayload);
    });

    try {
        // Send all notifications and wait for them to complete
        const responses = await Promise.all(promises);

        console.log('Notifications sent successfully:', responses);

        // // Log failures
        // responses.forEach((resp, index) => {
        //     if (!resp.success) {
        //         console.error(`Failed to send notification to token ${registrationTokens[index]}:`, resp.error);
        //     }
        // });

    } catch (error) {
        console.error('Error sending notifications:', error);
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


module.exports = { fetchAllUserToken, sendPushNotification, sendAdminNotification };