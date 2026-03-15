// Importing required modules 

// Importing models
const loginModel = require("../model/adminLoginModel");
const paymentGatewayModel = require("../model/paymentGatewayModel");
const { verifyAdminAccess } = require("../config/verification");
// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load and render the payment gateway view
const loadPaymentGateway = async (req, res) => {
    try {
        await verifyAdminAccess(req, res, async () => {

        // fetch all payment gateway
        const paymentMethodDetails = await paymentGatewayModel.findOne();

        return res.render("paymentGateway", { paymentMethodDetails });

        });
        
    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load payment gateway");
        return res.redirect(req.get("referer"));
    }
}

//edit stripe payment method 
const editStripePaymentMethod = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request body
            const id = req.body.id;
            const stripe_is_enable = req.body.stripe_is_enable ? req.body.stripe_is_enable : 0;
            const stripe_mode = req.body.stripe_mode;
            const stripe_test_mode_publishable_key = req.body.stripe_test_mode_publishable_key;
            const stripe_test_mode_secret_key = req.body.stripe_test_mode_secret_key;
            const stripe_live_mode_publishable_key = req.body.stripe_live_mode_publishable_key;
            const stripe_live_mode_secret_key = req.body.stripe_live_mode_secret_key;

            let result;

            if (id) {
                // update stripe
                result = await paymentGatewayModel.findByIdAndUpdate(id, { stripe_is_enable, stripe_mode, stripe_test_mode_publishable_key, stripe_test_mode_secret_key, stripe_live_mode_publishable_key, stripe_live_mode_secret_key }, { new: true });

            } else {
                // save stripe
                result = await paymentGatewayModel.create({ stripe_is_enable, stripe_mode, stripe_test_mode_publishable_key, stripe_test_mode_secret_key, stripe_live_mode_publishable_key, stripe_live_mode_secret_key });
            }

            if (result) {

                req.flash("success", id ? "Stripe configuration updated successfully." : "Stripe configuration added successfully.");
                return res.redirect(process.env.BASE_URL + "payment-gateway");

            } else {

                req.flash("error", "Failed to update stripe configuration. Try again later...");
                return res.redirect(process.env.BASE_URL + "payment-gateway");
            }

        }
        else {

            req.flash('error', 'You do not have permission to edit stripe. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "payment-gateway");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit stripe");
        return res.redirect(process.env.BASE_URL + "payment-gateway");
    }
}

//edit paypal payment method 
const editPaypalPaymentMethod = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request body
            const id = req.body.id;
            const paypal_is_enable = req.body.paypal_is_enable ? req.body.paypal_is_enable : 0;
            const paypal_mode = req.body.paypal_mode;
            const paypal_test_mode_merchant_id = req.body.paypal_test_mode_merchant_id;
            const paypal_test_mode_tokenization_key = req.body.paypal_test_mode_tokenization_key;
            const paypal_test_mode_public_key = req.body.paypal_test_mode_public_key;
            const paypal_test_mode_private_key = req.body.paypal_test_mode_private_key;
            const paypal_live_mode_merchant_id = req.body.paypal_live_mode_merchant_id;
            const paypal_live_mode_tokenization_key = req.body.paypal_live_mode_tokenization_key;
            const paypal_live_mode_public_key = req.body.paypal_live_mode_public_key;
            const paypal_live_mode_private_key = req.body.paypal_live_mode_private_key;

            let result;

            if (id) {
                // update paypal
                result = await paymentGatewayModel.findByIdAndUpdate(id, { paypal_is_enable: paypal_is_enable, paypal_mode: paypal_mode, paypal_test_mode_merchant_id: paypal_test_mode_merchant_id, paypal_test_mode_tokenization_key: paypal_test_mode_tokenization_key, paypal_test_mode_public_key: paypal_test_mode_public_key, paypal_test_mode_private_key: paypal_test_mode_private_key, paypal_live_mode_merchant_id: paypal_live_mode_merchant_id, paypal_live_mode_tokenization_key: paypal_live_mode_tokenization_key, paypal_live_mode_public_key: paypal_live_mode_public_key, paypal_live_mode_private_key: paypal_live_mode_private_key }, { new: true });

            } else {
                // save paypal
                result = await paymentGatewayModel.create({ paypal_is_enable: paypal_is_enable, paypal_mode: paypal_mode, paypal_test_mode_merchant_id: paypal_test_mode_merchant_id, paypal_test_mode_tokenization_key: paypal_test_mode_tokenization_key, paypal_test_mode_public_key: paypal_test_mode_public_key, paypal_test_mode_private_key: paypal_test_mode_private_key, paypal_live_mode_merchant_id: paypal_live_mode_merchant_id, paypal_live_mode_tokenization_key: paypal_live_mode_tokenization_key, paypal_live_mode_public_key: paypal_live_mode_public_key, paypal_live_mode_private_key: paypal_live_mode_private_key });
            }

            if (result) {

                req.flash("success", id ? "Paypal configuration updated successfully." : "Paypal configuration added successfully.");
                return res.redirect(process.env.BASE_URL + "payment-gateway");

            } else {

                req.flash("error", "Failed to update paypal configuration. Try again later...");
                return res.redirect(process.env.BASE_URL + "payment-gateway");

            }

        }
        else {

            req.flash('error', 'You do not have permission to edit paypal. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "payment-gateway");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit paypal");
        return res.redirect(process.env.BASE_URL + "payment-gateway");
    }
}

//edit payment method 
const editRazorpayPaymentMethod = async (req, res) => {

    try {

        const loginData = await loginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request body
            const id = req.body.id;
            const razorpay_is_enable = req.body.razorpay_is_enable ? req.body.razorpay_is_enable : 0;
            const razorpay_mode = req.body.razorpay_mode;
            const razorpay_test_mode_key_id = req.body.razorpay_test_mode_key_id;
            const razorpay_test_mode_key_secret = req.body.razorpay_test_mode_key_secret;
            const razorpay_live_mode_key_id = req.body.razorpay_live_mode_key_id;
            const razorpay_live_mode_key_secret = req.body.razorpay_live_mode_key_secret;

            let result;

            if (id) {
                // update razorpay
                result = await paymentGatewayModel.findByIdAndUpdate(id, { razorpay_is_enable: razorpay_is_enable, razorpay_mode: razorpay_mode, razorpay_test_mode_key_id: razorpay_test_mode_key_id, razorpay_test_mode_key_secret: razorpay_test_mode_key_secret, razorpay_live_mode_key_id: razorpay_live_mode_key_id, razorpay_live_mode_key_secret: razorpay_live_mode_key_secret, }, { new: true });
            } else {
                //save razorpay
                result = await paymentGatewayModel.create({ razorpay_is_enable: razorpay_is_enable, razorpay_mode: razorpay_mode, razorpay_test_mode_key_id: razorpay_test_mode_key_id, razorpay_test_mode_key_secret: razorpay_test_mode_key_secret, razorpay_live_mode_key_id: razorpay_live_mode_key_id, razorpay_live_mode_key_secret: razorpay_live_mode_key_secret });
            }

            if (result) {

                req.flash("success", id ? "Razorpay configuration updated successfully." : "Razorpay configuration added successfully.");
                return res.redirect(process.env.BASE_URL + "payment-gateway");

            } else {

                req.flash("error", "Failed to update razorpay configuration. Try again later...");
                return res.redirect(process.env.BASE_URL + "payment-gateway");
            }

        }
        else {

            req.flash('error', 'You do not have permission to edit razorpay. As a demo admin, you can only view the content.');
            return res.redirect(process.env.BASE_URL + "payment-gateway");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit razorpay");
        return res.redirect(process.env.BASE_URL + "payment-gateway");
    }
}

module.exports = {

    loadPaymentGateway,
    editStripePaymentMethod,
    editRazorpayPaymentMethod,
    editPaypalPaymentMethod,

}


