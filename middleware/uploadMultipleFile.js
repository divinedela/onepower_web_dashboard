const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const deleteImage = require("../services/deleteImage");

// Ensure the upload directory exists
const ensureUploadDir = (uploadDir) => {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
};

// Generate a unique filename with a timestamp
const generateFileName = (file) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const sanitizedOriginalName = baseName.replace(/\s+/g, '-');
    return `${timestamp}_${sanitizedOriginalName}.webp`;
};

// Multer configuration: Store files in memory & validate types
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(null, false);
            req.fileValidationError = `Invalid file type: ${file.originalname}. Only images are allowed.`;
        }
    }
});

// Function to delete all uploaded files
const deleteAllUploadedFiles = (files) => {
    if (!files) return;
    for (const fieldname in files) {
        for (const file of files[fieldname]) {
            deleteImage(file.filename);
        }
    }
};

// Image Compression Middleware
const compressImages = async (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return next(); // No files uploaded, proceed
    }

    const uploadDir = path.join(__dirname, "../uploads/");
    ensureUploadDir(uploadDir);

    try {
        for (const fieldname in req.files) {
            for (const file of req.files[fieldname]) {
                const newFileName = generateFileName(file);
                const filePath = path.join(uploadDir, newFileName);

                await sharp(file.buffer)
                    .resize({ width: 1024, withoutEnlargement: true })
                    .toFormat("webp", { quality: 50 }) // Convert to WebP with 50% quality
                    .toFile(filePath);

                // Replace original file details with compressed file details
                file.filename = newFileName;
                file.path = filePath;
                file.mimetype = "image/webp";
            }
        }
        next();
    } catch (error) {
        console.error("Image compression failed:", error);
        deleteAllUploadedFiles(req.files);
        req.flash("error", "Image compression process failed.");
        return res.redirect(req.get("Referrer") || process.env.BASE_URL);
    }
};

// Upload Middleware Function
const uploadMiddleware = (fields) => (req, res, next) => {
    upload.fields(fields)(req, res, async (err) => {
        if (err) {
            console.error("Multer Error:", err);
            deleteAllUploadedFiles(req.files);
            req.flash("error", err.message || "File upload failed.");
            return res.redirect(req.get("Referrer") || process.env.BASE_URL);
        }

        // Handle invalid file type errors
        if (req.fileValidationError) {
            deleteAllUploadedFiles(req.files);
            req.flash("error", req.fileValidationError);
            return res.redirect(req.get("Referrer") || process.env.BASE_URL);
        }

        try {
            await compressImages(req, res, next);
        } catch (error) {
            console.error("Upload error:", error);
            deleteAllUploadedFiles(req.files);
            req.flash("error", "An unexpected error occurred while processing the file.");
            return res.redirect(req.get("Referrer") || process.env.BASE_URL);
        }
    });
};
// Fields to Upload
const fieldsToUpload = [
    { name: "image", maxCount: 1 },
    { name: "organizer_image", maxCount: 1 },
    { name: "gallery" }
];

// Export Middleware
const uploadMultipleFile = uploadMiddleware(fieldsToUpload);

module.exports = uploadMultipleFile;
