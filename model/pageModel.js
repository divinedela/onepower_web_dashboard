const mongoose = require("mongoose");

const pageSchema = new mongoose.Schema({

    private_policy: {
        type: String,
        default: null,
        trim: true
    },
    terms_and_condition: {
        type: String,
        default: null,
        trim: true
    },
    about_us: {
        type: String,
        default: null,
        trim: true
    }
},
    {
        timestamps: true
    }
);

module.exports = mongoose.model("pages", pageSchema);