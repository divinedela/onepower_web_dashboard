// Importing required modules 

// Importing models
const loginModel = require("../model/adminLoginModel");
const introModel = require("../model/introModel");
const { verifyAdminAccess } = require("../config/verification");
// Importing the service function to delete uploaded files
const deleteImage = require("../services/deleteImage");


// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load and render the view for add intro
const loadAddIntro = async (req, res) => {

    try {

        return res.render("addIntro");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load add intro");
        return res.redirect(process.env.BASE_URL + "intro");
    }
}

// add intro
const addIntro = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.adminId);

        if (loginData && loginData.is_admin === 0) {

            // delete upload image
            deleteImage(req.file.filename);

            req.flash('error', 'You do not have permission to add intro. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "add-intro");
        }

        // Extract data from the request body
        const image = req.file.filename;
        const title = req.body.title;
        const description = req.body.description;

        // save intro
        const newIntro = new introModel({ image, title, description }).save();

        return res.redirect(process.env.BASE_URL + "intro");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to add intro");
        return res.redirect(process.env.BASE_URL + "intro");
    }
}

// Load and render the view for intro
const loadIntro = async (req, res) => {

    try {
        await verifyAdminAccess(req, res, async () => {
        // check if the user is verified
        // const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        // const currentUrl = protocol + '://' + req.get('host') + process.env.BASE_URL;
        // const verifyData = await checkVerify(currentUrl);

        // if (verifyData === 0) { clearConfigData(); }

        // fetch all intro
        const intro = await introModel.find();

        //  fetch admin
        const loginData = await loginModel.find();

        return res.render("intro", { intro, IMAGE_URL: process.env.IMAGE_URL, loginData });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load intro");
        return res.redirect(req.get("referer"));
    }
}

// Load and render the view for edit intro
const loadEditIntro = async (req, res) => {

    try {

        // Extract data from the request query
        const id = req.query.id;

        // fetch intro using id
        const intro = await introModel.findOne({ _id: id });

        return res.render("editIntro", { intro, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load edit intro");
        return res.redirect(req.get("referer"));
    }
}

// edit intro
const editIntro = async (req, res) => {
    const id = req.body.id;
    try {

        // Extract data from the request body
        const title = req.body.title;
        const description = req.body.description;
        const oldImage = req.body.oldImage;

        let image = oldImage;
        if (req.file) {
            // delete old image
            deleteImage(oldImage);
            image = req.file.filename;
        }

        // update intro
        const updateIntro = await introModel.findOneAndUpdate({ _id: id }, { $set: { title, description, image } });

        return res.redirect(process.env.BASE_URL + "intro");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit intro");
        return res.redirect(process.env.BASE_URL + "edit-intro?id=" + id);
    }
}

// delete intro
const deleteIntro = async (req, res) => {

    try {

        // Extract data from the request query
        const id = req.query.id;

        // fetch intro using id
        const intro = await introModel.findById(id);

        // delete image
        deleteImage(intro.image);

        // delete intro
        const deletedIntro = await introModel.deleteOne({ _id: id });

        return res.redirect(process.env.BASE_URL + "intro");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to delete intro");
        return res.redirect(process.env.BASE_URL + "intro");
    }
}

// update intro status
const updateIntroStatus = async (req, res) => {

    try {
        // Extract data from the request query
        const id = req.query.id;

        // Validate id
        if (!id) {
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect(process.env.BASE_URL + "intro");
        }

        // Update subject status in a single query
        await introModel.findByIdAndUpdate(
            id,
            [{ $set: { status: { $cond: { if: { $eq: ["$status", "Publish"] }, then: "UnPublish", else: "Publish" } } } }],
            { new: true }
        );

        return res.redirect(process.env.BASE_URL + "intro");

    } catch (error) {
        console.error(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(process.env.BASE_URL + "intro");
    }
}


module.exports = {

    loadAddIntro,
    addIntro,
    loadIntro,
    loadEditIntro,
    editIntro,
    deleteIntro,
    updateIntroStatus

}