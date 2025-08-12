const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({

    date: {
        type: String,
        required: true,
        trim: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "campaign",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        trim: true
    },
    payment_method: {
        type: String,
        required: true,
        trim: true
    },
    transaction_id: {
        type: String,
        required: true,
        trim: true
    },
    payment_status: {
        type: String,
        enum: ["Successful", "Failed"],
        required: true,
        trim: true
    }

},
    {
        timestamps: true
    }
);

module.exports = new mongoose.model("donation", donationSchema);