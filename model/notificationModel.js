const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({

    recipient: {
        type: String,
        enum: ["User", "Admin"],
        trim: true
    },
    recipient_user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    is_read: {
        type: Boolean,
        default: false,
        trim: true
    }

},
    {
        timestamps: true
    }
);

module.exports = mongoose.model("notification", notificationSchema);