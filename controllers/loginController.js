// Importing required modules
const sha256 = require("sha256");

// Importing models
const adminLoginModel = require("../model/adminLoginModel");
const introModel = require("../model/introModel");
const categoryModel = require("../model/categoryModel");
const campaignModel = require("../model/campaignModel");
const bannerModel = require("../model/bannerModel");
const userModel = require("../model/userModel");
const mailModel = require("../model/mailModel");
const donationModel = require("../model/donationModel");
const { verifyAdminAccess } = require("../config/verification");


// delete image
const deleteImage = require("../services/deleteImage");

// combine campaign and donation
const combineCampaignAndDonation = require("../services/combineCampaignAndDonation");

// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load and render the login view
const loadLogin = async (req, res) => {

    try {

        res.render("login");

    } catch (error) {
        console.log(error.message);
    }
}

//login
const login = async (req, res) => {

    try {

        const email = req.body.email;
        const password = sha256.x2(req.body.password);

        const isExistEmail = await adminLoginModel.findOne({ email: email });

        if (!isExistEmail) {

            req.flash("error", "We're sorry, something went wrong when attempting to login...");
            return res.redirect(process.env.BASE_URL);
        }
        else {

            if (password !== isExistEmail.password) {

                req.flash("error", "We're sorry, something went wrong when attempting to login...");
                return res.redirect(process.env.BASE_URL);

            } else {

                req.session.userId = isExistEmail._id;
                return res.redirect(process.env.BASE_URL + "dashboard");
            }
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to login");
        return res.redirect(process.env.BASE_URL);

    }
}

// Load and render the dashboard view
const loadDashboard = async (req, res) => {

    try {

        // check if the user is verified
        await verifyAdminAccess(req, res, async () => {

        // count documents
        const totalIntro = await introModel.countDocuments({ status: "Publish" });
        const totalCategory = await categoryModel.countDocuments({ status: "Publish" });
        const totalUpcomingCampaign = await campaignModel.countDocuments({ campaign_status: "Upcoming" });
        const totalRunningCampaign = await campaignModel.countDocuments({ campaign_status: "Running" });
        const totalEndedCampaign = await campaignModel.countDocuments({ campaign_status: "Ended" });
        const totalUserCampaign = await campaignModel.countDocuments({ isApproved: true, isUser: true });
        const totalBanner = await bannerModel.countDocuments({ status: "Publish" });
        const totalUser = await userModel.countDocuments({ is_active: true });
        const totalDonor = await donationModel.countDocuments();
        const userActiveCount = await userModel.countDocuments({ is_active: true });
        const userCount = await userModel.countDocuments();

        // fetch running campaign
        const campaign = await campaignModel.find({ campaign_status: "Running" }).sort({ createdAt: -1 }).limit(5);

        const updatedCampaign = await combineCampaignAndDonation(campaign);

        // fetch user campaign
        const userCampaign = await campaignModel.find({ isUser: true }).sort({ createdAt: -1 }).limit(7).populate("categoryId");

        // fetch lastest user
        const users = await userModel.find().sort({ createdAt: -1 }).limit(7).exec();

        return res.render("dashboard",
            {
                totalIntro, totalCategory, totalUpcomingCampaign, totalRunningCampaign, totalEndedCampaign, totalUserCampaign, totalBanner,
                totalUser, totalDonor, userActiveCount, userCount, campaign: updatedCampaign, userCampaign, users, IMAGE_URL: process.env.IMAGE_URL
            });

        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load dashboard");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the profile view
const loadProfile = async (req, res) => {

    try {

        const profile = await adminLoginModel.findById(req.session.userId);

        return res.render("profile", { profile, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load profile");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the edit profile view
const loadEditProfile = async (req, res) => {

    try {

        const profile = await adminLoginModel.findById(req.session.userId);

        return res.render("editProfile", { profile, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load edit profile");
        return res.redirect(req.get("referer"));
    }
}

// Edit an existing profile
const editProfile = async (req, res) => {

    try {

        const id = req.body.id;
        const name = req.body.name;
        const contact = req.body.contact;
        const oldImage = req.body.oldImage

        let avatar = oldImage;
        if (req.file) {
            deleteImage(oldImage)
            avatar = req.file.filename;
        }

        const profile = await adminLoginModel.findOneAndUpdate({ _id: id }, { $set: { name, contact, avatar } });

        return res.redirect(process.env.BASE_URL + "profile");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit profile");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the change password
const loadChangePassword = async (req, res) => {

    try {

        return res.render("changePassword");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load change password");
        return res.redirect(req.get("referer"));
    }
}

//change password
const changePassword = async (req, res) => {

    try {

        const oldpassword = sha256.x2(req.body.oldpassword);
        const newpassword = sha256.x2(req.body.newpassword);
        const comfirmpassword = sha256.x2(req.body.comfirmpassword);

        if (newpassword !== comfirmpassword) {
            req.flash('error', 'Confirm password does not match');
            return res.redirect(req.get("referer"));
        }

        const matchPassword = await adminLoginModel.findOne({ _id: req.session.userId });

        if (!matchPassword) {
            req.flash('error', 'Old password is wrong, please try again');
            return res.redirect(req.get("referer"));
        }

        if (oldpassword !== matchPassword.password) {
            req.flash('error', 'Old password is wrong, please try again');
            return res.redirect(req.get("referer"));
        }

        await adminLoginModel.findOneAndUpdate({ _id: req.session.userId }, { $set: { password: newpassword } }, { new: true });

        return res.redirect(process.env.BASE_URL + "dashboard");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to change password");
        return res.redirect(req.get("referer"));
    }
}

// logout
const logout = async (req, res) => {

    try {

        // Destroy the session
        req.session.destroy(function (err) {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Clear the cookie
            res.clearCookie('connect.sid');

            return res.redirect(process.env.BASE_URL);
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to logout");
        return res.redirect(req.get("referer"));
    }
}

// Load view for mail config
const loadMailConfig = async (req, res) => {

    try {
        await verifyAdminAccess(req, res, async () => {


        const mailData = await mailModel.findOne();

        return res.render("mailConfig", { mailData });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load mail config");
        return res.redirect(req.get("referer"));
    }
}

//edit mail config
const mailConfig = async (req, res) => {

    try {

        const loginData = await adminLoginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request
            const id = req.body.id;
            const host = req.body.host;
            const port = req.body.port;
            const mail_username = req.body.mail_username;
            const mail_password = req.body.mail_password;
            const encryption = req.body.encryption;
            const senderEmail = req.body.senderEmail;

            let result;

            if (id) {

                // Attempt to find and update an existing document
                result = await mailModel.findByIdAndUpdate(id, { host, port, mail_username, mail_password, encryption, senderEmail }, { new: true });

                if (result) {
                    req.flash("success", "Mail configuration updated successfully.");
                } else {
                    req.flash("error", "Failed to update mail configuration. Try again later...");
                }

            } else {
                // Create a new document if no id is provided
                result = await mailModel.create({ host, port, mail_username, mail_password, encryption, senderEmail });

                if (result) {
                    req.flash("success", "Mail configuration added successfully.");
                } else {
                    req.flash("error", "Failed to add mail configuration. Try again later...");
                }

            }

            return res.redirect(process.env.BASE_URL + "mail-config");

        }
        else {
            req.flash('error', 'You have no access to edit mail config, Only admin have access to this functionality...!!');
            return res.redirect(process.env.BASE_URL + "mail-config");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit mail config");
        return res.redirect(req.get("referer"));
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    loadProfile,
    loadEditProfile,
    editProfile,
    loadChangePassword,
    changePassword,
    logout,
    loadMailConfig,
    mailConfig
}