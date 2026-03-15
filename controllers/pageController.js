// Importing Models
const loginModel = require("../model/adminLoginModel");
const pageModel = require("../model/pageModel");    
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load and render the view for private policy
const loadPrivatePolicy = async (req, res) => {
    try {
        await verifyAdminAccess(req, res, async () => {

        // fetch private policy
        const privatePolicy = await pageModel.findOne();

        return res.render("privatePolicy", { privatePolicy });

        });
    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(req.get("referer"));
    }
}

// add private policy
const addPrivatePolicy = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request body
            const private_policy = req.body.private_policy.replace(/"/g, '&quot;');

            // Fetch existing privacy policy
            const existingPolicy = await pageModel.findOne();

            if (!existingPolicy) {

                // Create a new privacy policy if none exists
                await new pageModel({ private_policy: private_policy }).save();
            } else {

                // Update existing privacy policy
                await pageModel.findByIdAndUpdate(existingPolicy._id, { $set: { private_policy: private_policy } }, { new: true });
            }

            req.flash('success', existingPolicy && existingPolicy.private_policy ? 'Privacy policy updated successfully.' : 'Privacy policy added successfully.');

            return res.redirect(process.env.BASE_URL + "private-policy");
        }
        else {

            req.flash('error', 'You do not have permission to change private policy. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "private-policy");
        }

    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(req.get("referer"));
    }
}

// Load and render the view for terms and condition
const loadTermsAndCondition = async (req, res) => {

    try {
        await verifyAdminAccess(req, res, async () => {

        // fetch terms and condition
        const termsAndCondition = await pageModel.findOne();

        return res.render("termsAndCondition", { termsAndCondition });

        });

    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(req.get("referer"));
    }
}

// add terms and condition
const addTermsAndCondition = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request body
            const terms_and_condition = req.body.terms_and_condition.replace(/"/g, '&quot;');

            // fetch terms and condition
            const termsAndCondition = await pageModel.findOne();

            if (!termsAndCondition) {

                // Create a new terms and conditions if none exists
                const newtermsAndCondition = await new pageModel({ terms_and_condition: terms_and_condition }).save();

            } else {

                // Update existing terms and conditions
                const updatedData = await pageModel.findOneAndUpdate({ _id: termsAndCondition._id }, { $set: { terms_and_condition: terms_and_condition } }, { new: true });
            }

            req.flash('success', termsAndCondition && termsAndCondition.terms_and_condition ? 'Terms and conditions updated successfully....' : 'Terms and conditions added successfully....');

            return res.redirect(process.env.BASE_URL + "terms-and-condition");

        }
        else {

            req.flash('error', 'You do not have permission to change terms and conditions. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "terms-and-condition");
        }

    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(req.get("referer"));
    }
}

// Load and render the view for About Us
const loadAboutUs = async (req, res) => {

    try {

        await verifyAdminAccess(req, res, async () => {

            // Fetch About Us content
            const aboutUs = await pageModel.findOne();

            return res.render("aboutUs", { aboutUs });

        });

    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Something went wrong. Please try again.');
        return res.redirect(req.get("referer"));
    }
};

// Add or update About Us content
const addAboutUs = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.adminId);

        if (loginData && loginData.is_admin === 0) {
            req.flash('error', 'You do not have permission to change About Us content. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "about-us");
        }

        // Extract data from the request body
        const about_us_content = req.body.about_us_content.replace(/"/g, '&quot;');

        // Fetch existing About Us content
        let aboutUs = await pageModel.findOne();

        if (!aboutUs) {
            // Create new About Us content if none exists
            aboutUs = await new pageModel({ about_us: about_us_content }).save();
            req.flash('success', 'About Us content added successfully.');
        } else {
            // Update existing About Us content
            await pageModel.findOneAndUpdate({ _id: aboutUs._id }, { $set: { about_us: about_us_content } }, { new: true });
            req.flash('success', 'About Us content updated successfully.');
        }

        return res.redirect(process.env.BASE_URL + "about-us");

    } catch (error) {
        console.log("Error updating About Us:", error.message);
        req.flash("error", "Failed to update About Us content");
        return res.redirect(process.env.BASE_URL + "about-us");
    }
};

module.exports = {

    loadPrivatePolicy,
    addPrivatePolicy,
    loadTermsAndCondition,
    addTermsAndCondition,
    loadAboutUs,
    addAboutUs
}