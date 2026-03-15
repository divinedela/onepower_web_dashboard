const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema({

    stripe_is_enable: {
        type: Number,
        default: 0
    },
    stripe_mode: {
        type: String,
        enum: ["testMode", "liveMode"],
        default: "testMode"
    },
    stripe_test_mode_publishable_key: {
        type: String,
        default: "",
        trim: true
    },
    stripe_test_mode_secret_key: {
        type: String,
        default: "",
        trim: true
    },
    stripe_live_mode_publishable_key: {
        type: String,
        default: "",
        trim: true
    },
    stripe_live_mode_secret_key: {
        type: String,
        default: "",
        trim: true
    },
    razorpay_is_enable: {
        type: Number,
        default: 0
    },
    razorpay_mode: {
        type: String,
        enum: ["testMode", "liveMode"],
        default: "testMode"
    },
    razorpay_test_mode_key_id: {
        type: String,
        default: "",
        trim: true
    },
    razorpay_test_mode_key_secret: {
        type: String,
        default: "",
        trim: true
    },
    razorpay_live_mode_key_id: {
        type: String,
        default: "",
        trim: true
    },
    razorpay_live_mode_key_secret: {
        type: String,
        default: "",
        trim: true
    },
    paypal_is_enable: {
        type: Number,
        default: 0
    },
    paypal_mode: {
        type: String,
        enum: ["testMode", "liveMode"],
        default: "testMode"
    },
    paypal_test_mode_merchant_id: {
        type: String,
        default: "",
        trim: true
    },
    paypal_test_mode_tokenization_key: {
        type: String,
        default: "",
        trim: true
    },
    paypal_test_mode_public_key: {
        type: String,
        default: "",
        trim: true
    },
    paypal_test_mode_private_key: {
        type: String,
        default: "",
        trim: true
    },
    paypal_live_mode_merchant_id: {
        type: String,
        default: "",
        trim: true
    },
    paypal_live_mode_tokenization_key: {
        type: String,
        default: "",
        trim: true
    },
    paypal_live_mode_public_key: {
        type: String,
        default: "",
        trim: true
    },
    paypal_live_mode_private_key: {
        type: String,
        default: "",
        trim: true
    }

},
    {
        timestamps: true
    }
);

module.exports = mongoose.model('paymentgateways', paymentMethodSchema);