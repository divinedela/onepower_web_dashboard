const axios = require('axios');
const FormData = require('form-data');
const { encrypt, decrypt } = require('../utils/encryption');
const Verification = require('../model/verificationModel');

// Load Verification
const loadVerification = async(req,res)=>{
    try {
        const verificationData = await Verification.findOne({ isActive: true }).sort({ verifiedAt: -1 });
        const decryptedKey = verificationData ? decrypt(verificationData.key) : '';
        res.render('verification', { decryptedKey, hasKey: !!verificationData });
    } catch (error) {
        console.log(error.message);
        res.render('verification', { decryptedKey: '', hasKey: false });
    }
}

// Add Key
const keyVerification = async (req, res) => {
    try {
        const { key } = req.body;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const base_url = protocol + '://' + req.get('host');

        // Create FormData
        const formData = new FormData();
        formData.append('key', key);
        formData.append('base_url', base_url);

        // Call external URL for verification
        const response = await axios.post('https://templatevilla.net/codecanyon/backend/charityfundingappverify/api/response.php', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'User-Agent': 'PostmanRuntime/7.43.0'
            }
        });

        // Check response format and handle accordingly
        if (response.data?.data) {
            // Handle successful verification
            if (response.data.data.success) {
                await Verification.create({
                    key: encrypt(key),
                    base_url: encrypt(base_url),
                    isActive: true
                });
                req.flash('success', 'Key verified and stored successfully');
            } else {
                req.flash('error', 'Key verification failed');
            }
        } else {
            req.flash('error', 'Invalid verification response format');
        }
        res.redirect('/verification');
    } catch (error) {
        console.log(error.message);
        req.flash('error', 'Failed to verify key. Please try again.');
        res.redirect('/verification');
    }
}

// revoke Key
const revokeKey = async (req, res) => {
    try {
        // Check if key exists
        const verificationData = await Verification.findOne({ isActive: true }).sort({ verifiedAt: -1 });
        if (!verificationData) {
            req.flash('info', 'No key found to revoke');
            return res.redirect('/verification');
        }

        // Prepare for revocation
        const decryptedKey = decrypt(verificationData.key);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const base_url = `${protocol}://${req.get('host')}`;

        // Create FormData for revocation request
        const formData = new FormData();
        formData.append('key', decryptedKey);
        formData.append('base_url', base_url);
        formData.append('action', 'revoke');

        // Call external URL for revocation
        const response = await axios.post('https://templatevilla.net/codecanyon/backend/charityfundingappverify/api/revoke.php', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'User-Agent': 'PostmanRuntime/7.43.0'
            }
        });

        // Handle response
        if (response.data?.data) {
            if (response.data.data.success) {
                // Delete verification data from config
                await Verification.findOneAndDelete({ isActive: true });
                req.flash('success', 'Key removed successfully');
            } else {
                req.flash('error', 'Key verification failed');
            }
        } else {
            req.flash('error', 'Invalid verification response format');
        }

        res.redirect('/verification');
    } catch (error) {
        req.flash('error', 'Error in revocation process, key removed locally');
        res.redirect('/verification');
    }
}

module.exports = {
    loadVerification,
    keyVerification,
    revokeKey
}

