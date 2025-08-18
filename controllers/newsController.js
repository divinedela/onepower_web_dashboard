// controllers/newsController.firebase.js
// Works with Busboy/Sharp/Firebase upload middlewares that set:
//   req.files[field][i].publicUrl  // full downloadable URL
//   req.files[field][i].path       // GCS object path (e.g., "uploads/123.webp")
// Or single-file variant: req.file.publicUrl

const newsModel = require("../model/newsModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Firebase bucket (for deletes)
const { bucket } = require("../config/firebaseAdmin");

// ---------------- helpers: delete + cleanup ----------------
const storagePathFromUrl = (urlOrPath = "") => {
  try {
    if (!urlOrPath) return null;
    if (/^https?:\/\//i.test(urlOrPath)) {
      // tokenized gs URL: .../o/<encodedPath>?alt=media&token=...
      const afterO = urlOrPath.split("/o/")[1];
      if (!afterO) return null;
      const encodedPath = afterO.split("?")[0];
      return decodeURIComponent(encodedPath);
    }
    // already a storage path ("uploads/..")
    return urlOrPath;
  } catch {
    return null;
  }
};

const deleteFromFirebaseByUrlOrPath = async (urlOrPath) => {
  const objPath = storagePathFromUrl(urlOrPath);
  if (!objPath) return;
  try {
    await bucket.file(objPath).delete();
  } catch (e) {
    // ignore if not found or transient error
  }
};

const cleanupUploadedReqFiles = async (files) => {
  if (!files) return;
  const jobs = [];
  for (const field in files) {
    for (const f of files[field]) {
      const p = f?.firebaseStorage?.path || f?.path || f?.publicUrl;
      if (p) jobs.push(deleteFromFirebaseByUrlOrPath(p));
    }
  }
  await Promise.allSettled(jobs);
};

// robust getter (multi or single upload middleware)
const getUploadedImageUrl = (req) =>
  req.files?.image?.[0]?.publicUrl || req.file?.publicUrl || null;

// ---------------- Controllers ----------------

// Load list
const loadNews = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const news = await newsModel.find().sort({ createdAt: -1 });
      const loginData = await adminLoginModel.find();
      return res.render("news", { news, loginData, IMAGE_URL: "" });
    });
  } catch (error) {
    console.log("loadNews error:", error.message);
    req.flash("error", "Failed to load news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

// Add (view)
const loadAddNews = async (_req, res) => {
  try {
    return res.render("addNews");
  } catch (error) {
    console.log("loadAddNews error:", error.message);
    req.flash("error", "Failed to load add news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

// Add (submit)
const addNews = async (req, res) => {
  try {
    const loginData = await adminLoginModel.findById(req.session.userId);

    // Demo admin guard
    if (loginData && loginData.isAdmin === 0) {
      await cleanupUploadedReqFiles(req.files);
      req.flash(
        "error",
        "You do not have permission to add news. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "add-news");
    }

    const { title } = req.body;
    const description = (req.body.description || "").replace(/"/g, "&quot;");
    const imageUrl = getUploadedImageUrl(req);

    if (!title || !description || !imageUrl) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Please provide title, description and image.");
      return res.redirect(process.env.BASE_URL + "add-news");
    }

    await new newsModel({
      title,
      description,
      image: imageUrl,
      status: "Publish",
      publishedAt: new Date(),
    }).save();

    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("addNews error:", error.message);
    await cleanupUploadedReqFiles(req.files);
    req.flash("error", "Failed to add news");
    return res.redirect(process.env.BASE_URL + "add-news");
  }
};

// Edit (view)
const loadEditNews = async (req, res) => {
  try {
    const id = req.query.id;
    const news = await newsModel.findById(id);
    if (!news) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    return res.render("editNews", { news, IMAGE_URL: "" });
  } catch (error) {
    console.log("loadEditNews error:", error.message);
    req.flash("error", "Failed to load edit news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

// Edit (submit)
const editNews = async (req, res) => {
  const id = req.body.id;
  try {
    const { title, oldImage } = req.body;
    const description = (req.body.description || "").replace(/"/g, "&quot;");

    if (!title || !description) {
      req.flash("error", "Please provide title and description.");
      return res.redirect(process.env.BASE_URL + "edit-news?id=" + id);
    }

    const newUrl = getUploadedImageUrl(req);
    let image = oldImage;

    if (newUrl) {
      await deleteFromFirebaseByUrlOrPath(oldImage); // replace image in storage
      image = newUrl;
    }

    await newsModel.findOneAndUpdate(
      { _id: id },
      { $set: { title, description, image } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("editNews error:", error.message);
    req.flash("error", "Failed to edit news");
    return res.redirect(process.env.BASE_URL + "edit-news?id=" + id);
  }
};

// Delete
const deleteNews = async (req, res) => {
  try {
    const id = req.query.id;
    const doc = await newsModel.findById(id);
    if (!doc) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    if (doc.image) await deleteFromFirebaseByUrlOrPath(doc.image);
    await newsModel.deleteOne({ _id: id });
    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("deleteNews error:", error.message);
    req.flash("error", "Failed to delete news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

// Toggle status
const updateNewsStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "news");
    }
    const doc = await newsModel.findById(id);
    if (!doc) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    const newStatus = doc.status === "Publish" ? "UnPublish" : "Publish";
    const update = { status: newStatus };
    if (newStatus === "Publish" && !doc.publishedAt)
      update.publishedAt = new Date();
    await newsModel.findByIdAndUpdate(id, { $set: update }, { new: true });

    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.error("updateNewsStatus error:", error.message);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL + "news");
  }
};

module.exports = {
  loadNews,
  loadAddNews,
  addNews,
  loadEditNews,
  editNews,
  deleteNews,
  updateNewsStatus,
};
