// Importing required modules

// Importing models
const loginModel = require("../model/adminLoginModel");
const currencyTimezoneModel = require("../model/currencyTimezoneModel");
const { verifyAdminAccess } = require("../config/verification");
// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load and render the currency view
const loadCurrency = async (req, res) => {
    try {
        await verifyAdminAccess(req, res, async () => {

        const currencyTimezone = await currencyTimezoneModel.findOne();

        return res.render("currency", { currencyTimezone });
            
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load currency");
        return res.redirect(req.get("referer"));
    }
}

// add currency
const addCurrency = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.adminId);

        if (loginData && loginData.is_admin === 0) {
            req.flash('error', 'You don\'t have permission to set currency & timezone. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + 'currency');
        }

        // Extract data from the request
        const id = req.body.id;
        const currency = req.body.currency;
        const timezone = req.body.timezone;

        if (id) {
            // Update existing document
            result = await currencyTimezoneModel.findByIdAndUpdate(id, { $set: { currency, timezone } }, { new: true });
        } else {
            // Create a new document
            result = await currencyTimezoneModel.create({ currency, timezone });
        }

        // Handle success or failure
        if (result) {
            req.flash("success", id ? "Currency & Timezone updated successfully." : "Currency & Timezone added successfully.");
        } else {
            req.flash("error", "Failed to add or update currency & timezone.");
        }

        return res.redirect(process.env.BASE_URL + 'currency');

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to add or update currency & timezone.");
        return res.redirect(process.env.BASE_URL + 'currency');
    }
}

module.exports = {
    loadCurrency,
    addCurrency
}
