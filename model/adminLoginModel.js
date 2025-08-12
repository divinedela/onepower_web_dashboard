const mongoose = require("mongoose");


const adminLoginSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    contact: {
        type: Number,
        required: true
    },
    avatar: {
        type: String,
        required: true
    },
    isAdmin: {
        type: Number,
        default: 0
    }

},
    {
        timestamps: true
    }
);

module.exports = new mongoose.model("logins", adminLoginSchema);