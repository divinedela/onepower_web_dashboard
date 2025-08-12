const mongoose = require("mongoose");


const bannerSchema = new mongoose.Schema({

    image: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "campaign",
        required: true
    },
    status: {
        type: String,
        enum: ["Publish", "UnPublish"],
        default: "Publish",
        trim: true
    }
},
    {
        timestamps: true
    }
);


module.exports = new mongoose.model("banner", bannerSchema);