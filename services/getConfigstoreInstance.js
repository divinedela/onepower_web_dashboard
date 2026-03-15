const Configstore = require('configstore');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');


// Encryption Configuration
const ENCRYPTION_KEY = crypto.createHash('sha256')
    .update(String(process.env.ENCRYPTION_KEY))
    .digest('base64')
    .substr(0, 32);

const IV_LENGTH = 16; // AES block size

// Encrypt Data
const encrypt = (text) => {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("Error encrypting data:", error.message);
        throw error;
    }
};

// Decrypt Data
const decrypt = (text) => {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) throw new Error('Invalid encrypted data format');

        const iv = Buffer.from(parts[0], 'hex');
        if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length');

        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(parts[1], 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Error decrypting data:", error.message);
        throw error;
    }
};

// Get Configstore Instance
const getConfigstoreInstance = async () => {

    try {

        const pkg = require('../package.json');
        
        const config = new Configstore('CyphaFund678');

        // console.log("Configstore instance created successfully.");
        // console.log("Config file path:", config.path); // Log the config file path
        return config;
    } catch (error) {
        console.error("Error getting Configstore instance:", error.message);
        throw error;
    }
};

// Set Config Data
const setConfigData = async (data) => {

    try {

        const config = await getConfigstoreInstance();
        config.set(encrypt('success'), encrypt(data.success));
        config.set(encrypt('key'), encrypt(data.key));

    } catch (error) {
        console.error("Error setting config data:", error.message);
        throw error;
    }
};

// Get Config Data
const getConfigData = async () => {

    try {
        // console.log(" called getConfigData");
        const config = await getConfigstoreInstance();

        if (!config || !config.all) return {};

        const decryptedData = {};
        for (const [encKey, encValue] of Object.entries(config.all)) {
            try {
                decryptedData[decrypt(encKey)] = decrypt(encValue);
            } catch (err) {
                console.error("Error decrypting key-value pair:", err.message);
            }
        }

        return decryptedData;

    } catch (error) {
        console.error("Error getting config data:", error.message);
        return {};
    }
};


// Clear Config Data and Delete Config File
const clearConfigData = async () => {

    try {

        const config = await getConfigstoreInstance();
        const configPath = config.path;

        // Clear stored data
        config.clear();

        // Ensure file exists before deleting
        if (fs.existsSync(configPath)) {
            fs.rmSync(configPath, { force: true });
        }

    } catch (error) {
        console.error("Error clearing config data:", error.message);
        throw error;
    }
};

// Check Verification
const checkVerify = async (currentUrl) => {

    try {

        const data = await getConfigData();

        if (!data.key) return 0;

        const apiUrl = "https://templatevictory.com/verification/api/checkverify.php";
        const formData = new FormData();
        formData.append('key', data.key);
        formData.append('base_url', currentUrl);

        const response = await axios.post(apiUrl, formData)

        return response.data?.data?.success || 0;

    } catch (error) {
        console.error("Error checking verification:", error.message);
        return 0;
    }
};

module.exports = { getConfigData, setConfigData, clearConfigData, checkVerify };
