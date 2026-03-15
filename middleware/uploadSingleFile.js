// Importing required modules
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");


// Set storage (In-Memory)
const storage = multer.memoryStorage();

// Function to generate a unique filename with error handling
const generateFileName = (file) => {
    try {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        const sanitizedOriginalName = baseName.replace(/\s+/g, '-');
        return `${timestamp}_${sanitizedOriginalName}.webp`;
    } catch (error) {
        console.error("Error generating filename:", error);
        throw new Error("Filename generation failed.");
    }
};

// File filter function for images
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(null, false);
        req.fileValidationError = `Invalid file type: ${file.originalname}. Only images are allowed.`;
    }
};

// Ensure Upload Directory Exists
const ensureUploadDir = (uploadDir) => {
    try {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
    } catch (error) {
        console.error("Error creating upload directory:", error);
        throw new Error("Failed to create upload directory.");
    }
};

// Image Compression Middleware with error handling
const compressImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(); // No file uploaded, proceed
        }

        const file = req.file;
        const newFileName = generateFileName(file);
        const uploadDir = path.join(__dirname, "../uploads/");
        ensureUploadDir(uploadDir);

        const filePath = path.join(uploadDir, newFileName);

        // Compress and convert the image using sharp
        await sharp(file.buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .withMetadata()
            .toFormat('webp', { quality: 50 })
            .toFile(filePath);

        // Attach processed file details to req.file
        req.file.filename = newFileName;
        req.file.path = filePath;
        req.file.mimetype = "image/webp";

        next();
    } catch (error) {
        console.error("Image compression failed:", error);
        next(new Error("Image compression process failed."));
    }
};

// Upload handlers with error handling wrapper
const uploadImage = (req, res, next) => {
    const upload = multer({
        storage: storage,
        fileFilter: imageFileFilter,
    }).single('image');

    upload(req, res, async function (err) {
        try {
            const redirectUrl = req.get('Referrer') || '/';

            if (req.fileValidationError) {
                req.flash('error', req.fileValidationError);
                return res.redirect(redirectUrl);
            }
            if (err instanceof multer.MulterError) {
                req.flash('error', `Upload error: ${err.message}`);
                return res.redirect(redirectUrl);
            }
            if (err) {
                req.flash('error', `Something went wrong: ${err.message}`);
                return res.redirect(redirectUrl);
            }

            // Process with compression after successful upload
            await compressImage(req, res, next);
        } catch (error) {
            console.error("Unexpected error in upload process:", error);
            req.flash('error', 'An unexpected error occurred. Please try again.');
            return res.redirect(req.get('Referrer'));
        }
    });
};

// File filter function for images
const apiImageFileFilter = (req, file, cb) => {

    // Disallowed file types
    const disallowedTypes = ['application/pdf', 'video/mp4', 'video/mpeg', 'video/quicktime'];
    const res = req.res;

    if (!disallowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false);
        req.fileValidationError = `Invalid file type: ${file.originalname}. Only images are allowed.`;
    }

};

// Upload handlers with error handling wrapper
const uploadAvatar = (req, res, next) => {
    const upload = multer({
        storage: storage,
        fileFilter: apiImageFileFilter,
    }).single('avatar');

    upload(req, res, async function (err) {
        try {

            if (req.fileValidationError) {
                return res.json({ data: { success: 0, message: req.fileValidationError, error: 1 } })
            }
            if (err instanceof multer.MulterError) {
                return res.json({ data: { success: 0, message: `Upload error: ${err.message}`, error: 1 } })
            }
            if (err) {
                return res.json({ data: { success: 0, message: `Something went wrong: ${err.message}`, error: 1 } })
            }

            // Process with compression after successful upload
            await compressImage(req, res, next);
        } catch (error) {
            console.error("Unexpected error in upload process:", error);
            return res.json({ data: { success: 0, message: 'An unexpected error occurred. Please try again.', error: 1 } })
        }
    });
};




module.exports = { uploadImage, uploadAvatar};