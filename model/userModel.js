const mongoose = require("mongoose");

const userModel = new mongoose.Schema({

    image: {
        type: String,
        trim: true,
    },
    firstname: {
        type: String,
        required: true,
        trim: true
    },
    lastname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true
    },
    country_code: {
        type: String,
        required: true,
        trim: true
    },
    phone_number: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        trim: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    is_active: {
        type: Boolean,
        default: true
    }

},
    {
        timestamps: true
    }
);

module.exports = mongoose.model("users", userModel);