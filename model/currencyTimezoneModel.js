const mongoose = require("mongoose");

const currencyTimezoneSchema = new mongoose.Schema({

    currency: {
        type: String,
        required: true,
    },
    timezone: {
        type: String,
        required: true,
        trim: true
    }
},
    {
        timestamps: true,
    }
);

const currencyTimezone = mongoose.model("currencyTimezone", currencyTimezoneSchema);

module.exports = currencyTimezone;

