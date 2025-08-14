// middleware/upload.multiple.stream.js
const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");
const { pipeline } = require("stream");
const { bucket } = require("../config/firebaseAdmin");

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

const fieldsToUpload = [
  { name: "image", maxCount: 1 },
  { name: "organizer_image", maxCount: 1 },
  { name: "gallery" }, // multiple
];

function withinCount(counters, name) {
  const field = fieldsToUpload.find((f) => f.name === name);
  if (!field) return false;
  const max = field.maxCount ?? Infinity;
  const current = counters[name] ?? 0;
  return current < max;
}

const uploadMultipleFile = (req, res, next) => {
  if (!req.headers["content-type"]?.includes("multipart/form-data"))
    return next();

  const redirectUrl = req.get("Referrer") || process.env.BASE_URL || "/";
  const bb = Busboy({
    headers: req.headers,
    limits: { files: 30, fileSize: 25 * 1024 * 1024 }, // tune counts/sizes
  });

  req.body = req.body || {};
  req.files = req.files || {};
  const counters = {};

  let errorOut = null;
  const uploads = [];

  bb.on("field", (name, val) => (req.body[name] = val));
  bb.on("file", (name, file, infoOrFilename, encMaybe, mimeMaybe) => {
    // Support both Busboy APIs
    let filename, mimeType, encoding;
    if (typeof infoOrFilename === "string") {
      // v0.x: (name, file, filename, encoding, mimetype)
      filename = infoOrFilename || "";
      encoding = encMaybe;
      mimeType = mimeMaybe;
    } else if (infoOrFilename && typeof infoOrFilename === "object") {
      // v1.x: (name, file, info = { filename, encoding, mimeType })
      filename = infoOrFilename.filename || "";
      encoding = infoOrFilename.encoding;
      mimeType = infoOrFilename.mimeType;
    } else {
      filename = "";
      mimeType = undefined;
    }

    // 1) Only handle configured fields
    if (!fieldsToUpload.some((f) => f.name === name)) {
      return file.resume();
    }

    // 2) Skip EMPTY file parts quietly (your log shows one of these)
    if (!filename || filename === "blob") {
      // Nothing selected — do not count or error
      return file.resume();
    }

    // 3) Validate type (MIME or extension fallback)
    const type = (mimeType || "").toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    const allowedExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
    ]);
    const looksLikeImage = type.startsWith("image/") || allowedExts.has(ext);
    if (!looksLikeImage) {
      errorOut = new Error(
        `Invalid file type: ${filename}. Only images are allowed.`
      );
      return file.resume();
    }

    // 4) Enforce maxCount AFTER we know the file is valid
    if (!withinCount(counters, name)) {
      // Over the limit for this field — ignore extra files
      return file.resume();
    }
    counters[name] = (counters[name] ?? 0) + 1;

    // 5) Stream -> sharp -> Firebase Storage
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

    const p = new Promise((resolve, reject) => {
      pipeline(file, transformer, gcsWrite, (err) => {
        if (err) return reject(err);
        const publicUrl = makePublicUrl(bucket.name, dest, token);
        const fileObj = {
          fieldname: name,
          originalname: filename,
          encoding: encoding || "7bit",
          mimetype: "image/webp",
          filename: newFileName,
          path: dest, // GCS object path
          publicUrl,
          firebaseStorage: { bucket: bucket.name, path: dest, token },
        };
        (req.files[name] ||= []).push(fileObj);
        resolve();
      });
    });

    uploads.push(p);
  });

  // bb.on("file", (name, file, info) => {
  //   const { filename, mimeType } = info;

  //   console.log("multi info", info);

  //   // allow only configured fields
  //   if (
  //     !fieldsToUpload.some((f) => f.name === name) ||
  //     !withinCount(counters, name)
  //   ) {
  //     return file.resume();
  //   }
  //   counters[name] = (counters[name] ?? 0) + 1;

  //   // filter images
  //   if (!mimeType.startsWith("image/")) {
  //     errorOut = new Error(
  //       `Invalid file type: ${filename}. Only images are allowed.`
  //     );
  //     return file.resume();
  //   }

  //   const newFileName = generateFileName(filename);
  //   const dest = `uploads/${newFileName}`;
  //   const token = uuidv4();
  //   const gcsFile = bucket.file(dest);
  //   const gcsWrite = gcsFile.createWriteStream({
  //     resumable: false,
  //     metadata: {
  //       contentType: "image/webp",
  //       cacheControl: "public, max-age=31536000",
  //       metadata: { firebaseStorageDownloadTokens: token },
  //     },
  //   });

  //   const transformer = sharp()
  //     .resize({ width: 1024, withoutEnlargement: true })
  //     .withMetadata()
  //     .webp({ quality: 50 });

  //   const p = new Promise((resolve, reject) => {
  //     pipeline(file, transformer, gcsWrite, (err) => {
  //       if (err) return reject(err);
  //       const publicUrl = makePublicUrl(bucket.name, dest, token);
  //       const fileObj = {
  //         fieldname: name,
  //         originalname: filename,
  //         encoding: "7bit",
  //         mimetype: "image/webp",
  //         filename: newFileName,
  //         path: dest, // GCS object path
  //         publicUrl,
  //         firebaseStorage: { bucket: bucket.name, path: dest, token },
  //       };
  //       (req.files[name] ||= []).push(fileObj);
  //       resolve();
  //     });
  //   });

  //   uploads.push(p);
  // });

  bb.on("finish", async () => {
    if (errorOut) {
      // best-effort cleanup of anything uploaded before the error
      const deletions = [];
      for (const arr of Object.values(req.files)) {
        for (const f of arr) {
          deletions.push(
            bucket
              .file(f.path)
              .delete()
              .catch(() => {})
          );
        }
      }
      await Promise.allSettled(deletions);
      req.flash("error", errorOut.message);
      return res.redirect(redirectUrl);
    }

    try {
      await Promise.all(uploads);
      return next();
    } catch (err) {
      console.error("Upload error:", err);
      // cleanup
      const deletions = [];
      for (const arr of Object.values(req.files)) {
        for (const f of arr) {
          deletions.push(
            bucket
              .file(f.path)
              .delete()
              .catch(() => {})
          );
        }
      }
      await Promise.allSettled(deletions);
      req.flash("error", "Image compression/upload process failed.");
      return res.redirect(redirectUrl);
    }
  });

  bb.on("error", (err) => {
    console.error("Busboy error:", err);
    req.flash("error", "File upload failed.");
    return res.redirect(redirectUrl);
  });

  req.pipe(bb);
};

module.exports = uploadMultipleFile;
