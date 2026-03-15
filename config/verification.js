const axios = require('axios');
const FormData = require('form-data');
const { decrypt } = require('../utils/encryption');
const Verification = require('../model/verificationModel');

// Verify Access
const verifyAccess = async (req, res, next) => {
    try {
        const verification = await Verification.findOne({ isActive: true }).sort({ verifiedAt: -1 });
        
        if (!verification) {
            return res.json({
                data: {
                    success: 2,
                    message: "Access denied. Verification required.",
                    error: 1
                }
            });
        }

        const decryptedKey = decrypt(verification.key);
        const decryptedBaseUrl = decrypt(verification.base_url);

        if (!decryptedKey || !decryptedBaseUrl) {
            return res.json({
                data: {
                    success: 2,
                    message: "Access denied. Invalid or expired verification.",
                    error: 1       
                }
            }); 
        }

        next();
    } catch (error) {
        return res.json({
            data: {
                success: 0,
                message: "Verification check failed",
                error: error.message
            }
        });
    }
};

// Verify Admin Access
const verifyAdminAccess = async (req, res, next) => {
    try {
        const verification = await Verification.findOne({isActive: true}).sort({verifiedAt: -1});
        if (!verification) {
            return next();
        }

        const decryptedKey = decrypt(verification.key);
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const base_url = protocol + '://' + req.get('host');

         // Create form data for multipart/form-data
        const formData = new FormData();
        formData.append('key', decryptedKey);
        formData.append('base_url', base_url);
 
         // Make POST API call to verify
         const apiUrl = 'https://templatevilla.net/codecanyon/backend/charityfundingappverify/api/checkverify.php';
         const response = await axios.post(apiUrl, formData, {
             headers: {
                 'Content-Type': 'multipart/form-data',
                 'Accept': '*/*',
                 'Accept-Encoding': 'gzip, deflate, br',
                 'Connection': 'keep-alive',
                 'User-Agent': 'PostmanRuntime/7.43.0'
             }
         });

        if (response.data?.data?.success === 0) {
            await Verification.findOneAndDelete({isActive: true});
        }
        next();
    } catch (error) {
        await Verification.findOneAndDelete({isActive: true});
        next();
    }
};

module.exports = {
    verifyAccess,
    verifyAdminAccess
};