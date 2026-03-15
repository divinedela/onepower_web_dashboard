const mongoose = require("mongoose");

const favouriteCampaignSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        trim: true,
        required: true
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "campaign",
        trim: true,
        required: true
    }

},
    {
        timestamps: true
    }
);

module.exports = mongoose.model("favouriteCampaign", favouriteCampaignSchema);