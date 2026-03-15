const mongoose = require("mongoose");


const categorySchema = new mongoose.Schema({

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


module.exports = new mongoose.model("categories", categorySchema);