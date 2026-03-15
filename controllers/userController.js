// Importing models
const userModel = require("../model/userModel");
const donationModel = require("../model/donationModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load view for all user
const loadUser = async (req, res) => {

    try {

        await verifyAdminAccess(req, res, async () => {

            // Fetch all User data
            const users = await userModel.find();

            // Fetch all admin data
            const loginData = await adminLoginModel.find();

            // Render the "slider" view and pass data
            return res.render("user", { users, loginData, IMAGE_URL: process.env.IMAGE_URL });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load user");
        return res.redirect(req.get("referer"));
    }

}

//active user
const isActivate = async (req, res) => {

    try {

        const id = req.query.id;

        await userModel.findByIdAndUpdate(
            id,
            [{ $set: { is_active: { $cond: { if: { $eq: ["$is_active", false] }, then: true, else: false } } } }],
            { new: true }
        );

        return res.redirect(process.env.BASE_URL + "user");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to active/disactive user");
        return res.redirect(process.env.BASE_URL + "user");
    }

}

// Load view for all donor
const loadDonor = async (req, res) => {
try {

        await verifyAdminAccess(req, res, async () => {

        const donor = await donationModel.find().populate('userId campaignId').sort({ createdAt: -1 });

        return res.render("donor", { donor, IMAGE_URL: process.env.IMAGE_URL });
            
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load donor");
        return res.redirect(req.get("referer"));
    }
}

module.exports = {
    loadUser,
    isActivate,
    loadDonor,
}