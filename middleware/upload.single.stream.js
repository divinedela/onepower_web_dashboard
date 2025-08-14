// middleware/upload.single.stream.js
const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");
const { pipeline } = require("stream");
const { bucket } = require("../config/firebaseAdmin");

// --- helpers --------------------------------------------------------------

const generateFileName = (originalname = "file.jpg") => {
  const ts = Date.now();
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext).replace(/\s+/g, "-");
  return `${ts}_${base}.webp`;
};

const makePublicUrl = (bucketName, dest, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    dest
  )}?alt=media&token=${token}`;

const looksLikeImage = (filename = "", mimeType = "") => {
  const type = (mimeType || "").toLowerCase();
  const ext = path.extname(filename || "").toLowerCase();
  const allowedExts = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
  ]);
  return type.startsWith("image/") || allowedExts.has(ext);
};

// --- factory --------------------------------------------------------------

/**
 * Create a single-file streaming uploader for a specific field (e.g., "image").
 * It compresses to webp and stores in Firebase Storage, then sets:
 *   req.file = { publicUrl, path, filename, ... }
 *
 * Options:
 *  - mode: "redirect" | "json"   (how to respond on error)
 *  - maxFileSize: bytes (default 15MB)
 */
function createStreamingUploader(
  fieldName,
  { mode = "redirect", maxFileSize = 15 * 1024 * 1024 } = {}
) {
  return function singleUploader(req, res, next) {
    if (!req.headers["content-type"]?.includes("multipart/form-data"))
      return next();

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: maxFileSize },
    });

    const redirectUrl = req.get("Referrer") || process.env.BASE_URL || "/";
    req.body = req.body || {};

    let uploadPromise = null; // we await this in 'finish'
    let hadTargetFile = false;
    let validationError = null;

    // keep text fields (like Multer)
    bb.on("field", (name, val) => (req.body[name] = val));

    // Support both Busboy APIs: v1.x (info object) and v0.x (positional args)
    bb.on("file", (name, file, infoOrFilename, encMaybe, mimeMaybe) => {
      // Only handle the target field
      if (name !== fieldName) return file.resume();

      // Extract filename/mime/encoding across versions
      let filename, mimeType, encoding;
      if (typeof infoOrFilename === "string") {
        // v0.x signature: (name, file, filename, encoding, mimetype)
        filename = infoOrFilename || "";
        encoding = encMaybe;
        mimeType = mimeMaybe;
      } else if (infoOrFilename && typeof infoOrFilename === "object") {
        // v1.x signature: (name, file, info = { filename, encoding, mimeType })
        filename = infoOrFilename.filename || "";
        encoding = infoOrFilename.encoding;
        mimeType = infoOrFilename.mimeType;
      } else {
        filename = "";
        mimeType = "";
      }

      // Ignore duplicates (limits.files=1, but be safe)
      if (hadTargetFile) return file.resume();
      hadTargetFile = true;

      // Empty file part (user kept the picker empty)
      if (!filename || filename === "blob") return file.resume();

      // Validate type (image only)
      if (!looksLikeImage(filename, mimeType)) {
        validationError = new Error(
          `Invalid file type: ${filename}. Only images are allowed.`
        );
        return file.resume();
      }

      // Set up Firebase Storage write
      const newFileName = generateFileName(filename);
      const dest = `uploads/${newFileName}`;
      const token = uuidv4();
      const gcsFile = bucket.file(dest);
      const gcsWrite = gcsFile.createWriteStream({
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      // Sharp transform -> webp
      const transformer = sharp()
        .resize({ width: 1024, withoutEnlargement: true })
        .withMetadata()
        .webp({ quality: 50 });

      // IMPORTANT: create a promise and await it in 'finish'
      uploadPromise = new Promise((resolve, reject) => {
        pipeline(file, transformer, gcsWrite, (err) => {
          if (err) return reject(err);

          const publicUrl = makePublicUrl(bucket.name, dest, token);
          req.file = {
            fieldname: fieldName,
            originalname: filename,
            encoding: encoding || "7bit",
            mimetype: "image/webp",
            filename: newFileName,
            path: dest, // GCS object path
            publicUrl,
            firebaseStorage: { bucket: bucket.name, path: dest, token },
          };
          resolve();
        });
      });
    });

    bb.on("finish", async () => {
      // Delay 'next()' until the upload has actually completed
      const respondError = async (err) => {
        // Best-effort cleanup
        if (req.file?.path) {
          bucket
            .file(req.file.path)
            .delete()
            .catch(() => {});
        }
        if (mode === "redirect") {
          if (req.flash)
            req.flash("error", err.message || "File upload failed.");
          return res.redirect(redirectUrl);
        }
        return res.status(400).json({
          data: {
            success: 0,
            message: `Upload error: ${err.message}`,
            error: 1,
          },
        });
      };

      try {
        if (validationError) throw validationError;
        if (uploadPromise) await uploadPromise; // wait for pipeline -> GCS write
        return next();
      } catch (err) {
        return respondError(err);
      }
    });

    bb.on("error", (err) => {
      // Busboy parsing failed
      if (mode === "redirect") {
        if (req.flash) req.flash("error", "File upload failed.");
        return res.redirect(redirectUrl);
      }
      return res.status(400).json({
        data: { success: 0, message: "File upload failed.", error: 1 },
      });
    });

    // start parsing
    req.pipe(bb);
  };
}

// Ready-made middlewares matching your previous usage
const uploadImage = createStreamingUploader("image", { mode: "redirect" });
const uploadAvatar = createStreamingUploader("avatar", { mode: "json" });

module.exports = { createStreamingUploader, uploadImage, uploadAvatar };
