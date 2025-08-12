const mongoose = require('mongoose');

const MailSchema = mongoose.Schema({

    host: {
        type: String,
        required: true,
        trim: true
    },
    port: {
        type: String,
        required: true,
        trim: true
    },
    mail_username: {
        type: String,
        required: true,
        trim: true
    },
    mail_password: {
        type: String,
        required: true,
        trim: true
    },
    encryption: {
        type: String,
        required: true,
        trim: true
    },
    senderEmail: {
        type: String,
        required: true,
        trim: true
    }

},
    {
        timestamps: true
    }
);

const mailModel = mongoose.model('smpts', MailSchema);

module.exports = mailModel;