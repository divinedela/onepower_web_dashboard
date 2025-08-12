// Importing models
const campaignModel = require("../model/campaignModel");
const categoryModel = require("../model/categoryModel");
const bannerModel = require("../model/bannerModel");
const donationModel = require("../model/donationModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to delete uploaded files
const deleteImage = require("../services/deleteImage");

// Importing the service function to check if the user is verified
const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load view for adding a category
const loadAddCategory = async (req, res) => {

    try {

        return res.render("addCategory");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load add category");
        return res.redirect(process.env.BASE_URL + "category");
    }
}

// Add a new Category
const addCategory = async (req, res) => {

    try {

        const loginData = await adminLoginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 0) {
            deleteImage(req.file.filename);
            req.flash('error', "You don't have permission to add category. As a demo admin, you can only view the content.");
            return res.redirect(process.env.BASE_URL + "add-category");

        }

        // Extract data from the request
        const name = req.body.name;
        const image = req.file.filename;

        // Save the new  category
        const newCategory = await new categoryModel({ name, image }).save();

        return res.redirect(process.env.BASE_URL + "category");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to add category");
        return res.redirect(process.env.BASE_URL + "add-category");
    }
}

// Load view for all category
const loadCategory = async (req, res) => {
    try {
        await verifyAdminAccess(req, res, async () => {

        // Fetch all category data 
        const category = await categoryModel.find();

        const loginData = await adminLoginModel.find();

        // Render the "category" view and pass data
            return res.render("category", { category, loginData, IMAGE_URL: process.env.IMAGE_URL });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load category");
        return res.redirect(req.get("referer"));
    }
}

// Load view for editing an category
const loadEditCategory = async (req, res) => {

    try {

        const id = req.query.id;

        const category = await categoryModel.findById(id);

        return res.render("editCategory", { category, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load edit category");
        return res.redirect(req.get("referer"));
    }
}

// Edit an category
const editCategory = async (req, res) => {
    const id = req.body.id;
    try {

        // Extract data from the request
        const name = req.body.name;
        const oldImage = req.body.oldImage;

        let image = oldImage;
        if (req.file) {
            deleteImage(oldImage);
            image = req.file.filename;
        }

        //update specific category
        const updatedCategory = await categoryModel.findOneAndUpdate({ _id: id }, { $set: { name, image } });

        return res.redirect(process.env.BASE_URL + "category");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit category");
        return res.redirect(process.env.BASE_URL + "edit-category?id=" + id);
    }
}

// Delete an category
const deleteCategory = async (req, res) => {

    try {

        const id = req.query.id;

        // Fetch all campaign data specific to the category
        const campaignData = await campaignModel.find({ categoryId: id });

        // Delete campaign image, organizer image, and gallery images
        if (campaignData && campaignData.length > 0) {
            await Promise.all(
                campaignData.map(async (item) => {
                    deleteImage(item.image);
                    deleteImage(item.organizer_image);
                    await Promise.all(item.gallery.map(deleteImage));
                })
            );
        }

        // Fetch all slider data specific to the campaigns
        const bannerData = await bannerModel.find({ campaignId: { $in: campaignData.map(campaign => campaign._id) } });

        // Delete slider images
        if (bannerData && bannerData.length > 0) {
            await Promise.all(bannerData.map(async (banner) => deleteImage(banner.image)));
        }

        // Fetch and delete category image if exists
        const categoryData = await categoryModel.findById(id);
        if (categoryData) {
            deleteImage(categoryData.image);
        }

        // Delete sliders, donors, campaigns, and the specific category
        await bannerModel.deleteMany({ campaignId: { $in: campaignData.map(campaign => campaign._id) } });
        await donationModel.deleteMany({ campaignId: { $in: campaignData.map(campaign => campaign._id) } });
        await campaignModel.deleteMany({ categoryId: id });
        await categoryModel.deleteOne({ _id: id });

        return res.redirect(process.env.BASE_URL + "category");
    } catch (error) {
        console.error(error.message);
        req.flash("error", "Failed to delete category");
        return res.redirect(process.env.BASE_URL + "category");
    }
};


// update category status
const updateCategoryStatus = async (req, res) => {

    try {
        // Extract data from the request query
        const id = req.query.id;

        // Validate id
        if (!id) {
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect(process.env.BASE_URL + "category");
        }

        // Update category status in a single query
        await categoryModel.findByIdAndUpdate(
            id,
            [{ $set: { status: { $cond: { if: { $eq: ["$status", "Publish"] }, then: "UnPublish", else: "Publish" } } } }],
            { new: true }
        );

        return res.redirect(process.env.BASE_URL + "category");

    } catch (error) {
        console.error(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(process.env.BASE_URL + "category");
    }
}


module.exports = {
    loadAddCategory,
    addCategory,
    loadCategory,
    loadEditCategory,
    editCategory,
    deleteCategory,
    updateCategoryStatus
}