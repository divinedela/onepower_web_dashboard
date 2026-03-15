const mongoose = require("mongoose");


const campaignSchema = new mongoose.Schema({

    image: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "categories",
        required: true
    },
    starting_date: {
        type: String,
        required: true,
        trim: true
    },
    ending_date: {
        type: String,
        required: true,
        trim: true
    },
    campaign_amount: {
        type: Number,
        default: 0,
        trim: true
    },
    organizer_image: {
        type: String,
        required: true,
        trim: true
    },
    organizer_name: {
        type: String,
        required: true,
        trim: true
    },
    gallery: [{
        type: String,
        trim: true
    }],
    description: {
        type: String,
        required: true,
        trim: true
    },
    campaign_status: {
        type: String,
        enum: ["Upcoming", "Running", "Ended"],
        default: "Upcoming",
        trim: true
    },
    status: {
        type: String,
        enum: ["Publish", "UnPublish"],
        default: "Publish",
        trim: true
    },
    isUser: {
        type: Boolean,
        default: false
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },
    isApproved: {
        type: Boolean,
        default: false
    }
},
    {
        timestamps: true
    }
);

module.exports = new mongoose.model("campaign", campaignSchema);