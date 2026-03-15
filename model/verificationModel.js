const mongoose = require('mongoose');
const { encrypt } = require('../utils/encryption');
const verificationSchema = new mongoose.Schema({
    key: { 
        type: String, 
        required: true,
    },
    base_url: {
        type: String,
        required: true,
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, {timestamps: true});
module.exports = mongoose.model('Verification', verificationSchema);