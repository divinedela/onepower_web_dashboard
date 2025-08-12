const crypto = require('crypto');

// Get Key
function getKey(secret) {
    return crypto.createHash('sha256')
        .update(String(secret))
        .digest('base64')
        .substr(0, 32);
}

const SECRET_KEY = process.env.SESSION_SECREAT || 'carservice-secret-key';
const ENCRYPTION_KEY = getKey(SECRET_KEY);
const IV_LENGTH = 16;

// Encryption
function encrypt(text) {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

// Decryption
function decrypt(text) {
    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) {
            throw new Error('Invalid encrypted text format');
        }
        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Decryption error:', error);
        throw error;
    }
}
    
module.exports = {
    encrypt,
    decrypt
};