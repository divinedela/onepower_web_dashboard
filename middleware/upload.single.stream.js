// middleware/upload.single.stream.js
const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");
const { pipeline } = require("stream");
const { bucket } = require("../config/firebaseAdmin");

// --- helpers ---
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

function createStreamingUploader(fieldName, { mode }) {
  return function uploader(req, res, next) {
    if (!req.headers["content-type"]?.includes("multipart/form-data"))
      return next();

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: 15 * 1024 * 1024 }, // 15MB cap (tune)
    });

    let fileHandled = false;
    let validationError = null;
    const redirectUrl = req.get("Referrer") || "/";

    // preserve text fields like Multer would
    req.body = req.body || {};
    bb.on("field", (name, val) => (req.body[name] = val));

    bb.on("file", (name, file, info) => {
      console.log("single file", name, file, info);
      const { filename, mimeType } = info;

      // only handle our target field
      if (name !== fieldName) return file.resume();
      fileHandled = true;

      // filters (match your old logic)
      const disallowedForAvatar = new Set([
        "application/pdf",
        "video/mp4",
        "video/mpeg",
        "video/quicktime",
      ]);
      const isAvatar = fieldName === "avatar";
      if (
        isAvatar
          ? disallowedForAvatar.has(mimeType)
          : !mimeType.startsWith("image/")
      ) {
        validationError = `Invalid single file type: ${filename}. Only images are allowed.`;
        return file.resume();
      }

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

      const transformer = sharp()
        .resize({ width: 1024, withoutEnlargement: true })
        .withMetadata()
        .webp({ quality: 50 });

      pipeline(file, transformer, gcsWrite, async (err) => {
        if (err) return finish(err);

        const publicUrl = makePublicUrl(bucket.name, dest, token);
        req.file = {
          fieldname: fieldName,
          originalname: filename,
          encoding: "7bit",
          mimetype: "image/webp",
          filename: newFileName,
          path: dest, // GCS object path
          publicUrl,
          firebaseStorage: { bucket: bucket.name, path: dest, token },
        };
      });
    });

    bb.on("finish", () =>
      finish(validationError ? new Error(validationError) : null)
    );
    bb.on("error", (err) => finish(err));

    // start parsing
    req.pipe(bb);

    function finish(err) {
      if (mode === "redirect") {
        if (err) {
          req.flash("error", err.message || "File upload failed.");
          return res.redirect(redirectUrl);
        }
        return next();
      } else {
        if (err) {
          return res.json({
            data: {
              success: 0,
              message: `Upload error: ${err.message}`,
              error: 1,
            },
          });
        }
        return next();
      }
    }
  };
}

const uploadImage = createStreamingUploader("image", { mode: "redirect" });
const uploadAvatar = createStreamingUploader("avatar", { mode: "json" });

module.exports = { uploadImage, uploadAvatar };
