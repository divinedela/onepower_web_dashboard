// Importing models
const bannerModel = require("../model/bannerModel");
const campaignModel = require("../model/campaignModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to delete uploaded files
const deleteImage = require("../services/deleteImage");

// Importing the service function to check if the user is verified
// const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load view for adding a Banner
const loadAddBanner = async (req, res) => {

    try {

        // Fetch all campaign data
        const campaignData = await campaignModel.find();

        return res.render("addBanner", { campaignData });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to add banner");
        return res.redirect(process.env.BASE_URL + "banner");
    }

}

// Add a new Banner
const addBanner = async (req, res) => {

    try {

        const loginData = await adminLoginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request
            const title = req.body.title;
            const image = req.file.filename;
            const campaignId = req.body.campaignId;

            // Save the new  Banner
            const newBanner = new bannerModel({ title, image, campaignId }).save();

            return res.redirect(process.env.BASE_URL + "banner");

        }
        else {
            deleteImage(req.file.filename);
            req.flash('error', 'You have no access to add banner, Only admin have access to this functionality...!!');
            return res.redirect(process.env.BASE_URL + "add-banner");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to add banner");
        return res.redirect(process.env.BASE_URL + "add-banner");
    }

}

// Load view for all Banner
const loadBanner = async (req, res) => {
    try {
        await verifyAdminAccess(req, res, async () => {
            // Fetch all banner data
            const banner = await bannerModel.find().populate("campaignId");

            const loginData = await adminLoginModel.find();

            // Render the "Banner" view and pass data
            return res.render("banner", { banner, loginData, IMAGE_URL: process.env.IMAGE_URL });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load banner");
        return res.redirect(process.env.BASE_URL + "banner");
    }

}

// Load view for editing an Banner
const loadEditBanner = async (req, res) => {

    try {

        const id = req.query.id;

        // Fetch all campaign data
        const campaignData = await campaignModel.find();

        // Fetch Banner data specific id
        const banner = await bannerModel.findById(id)

        return res.render("editBanner", { banner, IMAGE_URL: process.env.IMAGE_URL, campaignData });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load banner");
        return res.redirect(process.env.BASE_URL + "banner");
    }
}

// Edit an Banner
const editBanner = async (req, res) => {
    // Extract data from the request
    const id = req.body.id;
    try {


        const title = req.body.title;
        const campaignId = req.body.campaignId;
        const oldImage = req.body.oldImage;

        let image = oldImage;
        if (req.file) {
            //delete old image
            deleteImage(oldImage);
            image = req.file.filename;
        }

        //update specific Banner
        const updatedBanner = await bannerModel.findOneAndUpdate({ _id: id }, { $set: { title, image, campaignId } });

        return res.redirect(process.env.BASE_URL + "banner");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit banner");
        return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
    }
}

// Delete an Banner
const deleteBanner = async (req, res) => {

    try {

        const id = req.query.id;

        const bannerData = await bannerModel.findById(id);

        // delete uploaded image
        deleteImage(bannerData.image);

        //delete specific Banner
        const deletedBanner = await bannerModel.deleteOne({ _id: id });

        return res.redirect(process.env.BASE_URL + "banner");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to delete banner");
        return res.redirect(process.env.BASE_URL + "banner");
    }
}

// update banner status
const updateBannerStatus = async (req, res) => {

    try {
        // Extract data from the request query
        const id = req.query.id;

        // Validate id
        if (!id) {
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect(process.env.BASE_URL + "banner");
        }

        await bannerModel.findByIdAndUpdate(
            id,
            [{ $set: { status: { $cond: { if: { $eq: ["$status", "Publish"] }, then: "UnPublish", else: "Publish" } } } }],
            { new: true }
        );

        return res.redirect(process.env.BASE_URL + "banner");

    } catch (error) {
        console.error(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect(process.env.BASE_URL + "banner");
    }
}


module.exports = {
    loadAddBanner,
    addBanner,
    loadBanner,
    loadEditBanner,
    editBanner,
    deleteBanner,
    updateBannerStatus
}