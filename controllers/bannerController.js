// controllers/bannerController.firebase.js
// Works with Busboy/Sharp/Firebase upload middleware that sets:
//   req.file.publicUrl              // full downloadable URL
//   req.file.path OR firebaseStorage.path // GCS object path (e.g., "uploads/123.webp")

// Models

const bannerModel = require("../model/bannerModel");
const newsModel = require("../model/newsModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Firebase bucket (for deletes)
const { bucket } = require("../config/firebaseAdmin");

// ---------------- helpers: delete + cleanup -------
const storagePathFromUrl = (urlOrPath = "") => {
  try {
    if (!urlOrPath) return null;
    if (/^https?:\/\//i.test(urlOrPath)) {
      const afterO = urlOrPath.split("/o/")[1];
      if (!afterO) return null;
      const encodedPath = afterO.split("?")[0];
      return decodeURIComponent(encodedPath);
    }
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
    // ignore
  }
};

const cleanupUploadedReqFile = async (file) => {
  if (!file) return;
  const p = file?.firebaseStorage?.path || file?.path || file?.publicUrl;
  if (p) await deleteFromFirebaseByUrlOrPath(p);
};

// Support .single('image') OR .fields([{name:'image'}])
const getUploadedImageUrl = (req) =>
  req.files?.image?.[0]?.publicUrl || req.file?.publicUrl || null;

// ---------------- Controllers ----------------

// Load view for adding a Banner
const loadAddBanner = async (req, res) => {
  try {
    const newsData = await newsModel.find().sort({ createdAt: -1 });
    return res.render("addBanner", { newsData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

// Add a new Banner
const addBanner = async (req, res) => {
  try {
    const loginData = await adminLoginModel.findById(req.session.userId);
    if (!(loginData && loginData.isAdmin === 1)) {
      req.flash(
        "error",
        "You have no access to add banner. Only admin has access."
      );
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    const { title, newsId } = req.body;
    const imageUrl = getUploadedImageUrl(req);

    if (!title || !newsId || !imageUrl) {
      req.flash("error", "Please select news, title and upload an image.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    // validate news exists
    const news = await newsModel.findById(newsId);
    if (!news) {
      req.flash("error", "Selected news not found.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    await new bannerModel({ title, image: imageUrl, newsId }).save();
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log("addBanner error:", error.message);
    req.flash("error", "Failed to add banner");
    return res.redirect(process.env.BASE_URL + "add-banner");
  }
};

// Load view for all Banners
const loadBanner = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const banner = await bannerModel.find().populate("newsId");
      const loginData = await adminLoginModel.find();

      return res.render("banner", { banner, loginData, IMAGE_URL: "" });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

// Load view for editing a Banner
const loadEditBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const newsData = await newsModel.find().sort({ createdAt: -1 });
    const banner = await bannerModel.findById(id);

    return res.render("editBanner", { banner, IMAGE_URL: "", newsData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

// Edit a Banner
const editBanner = async (req, res) => {
  const id = req.body.id;
  try {
    const { title, newsId, oldImage } = req.body;
    const newUrl = getUploadedImageUrl(req);
    let image = oldImage;

    if (!title || !newsId) {
      req.flash("error", "Please select news and enter a title.");
      return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
    }

    // validate news exists
    const news = await newsModel.findById(newsId);
    if (!news) {
      req.flash("error", "Selected news not found.");
      return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
    }

    if (newUrl) {
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = newUrl;
    }

    await bannerModel.findOneAndUpdate(
      { _id: id },
      { $set: { title, image, newsId } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log("editBanner error:", error.message);
    req.flash("error", "Failed to edit banner");
    return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
  }
};

// Delete a Banner
const deleteBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const doc = await bannerModel.findById(id);
    if (doc?.image) await deleteFromFirebaseByUrlOrPath(doc.image);
    await bannerModel.deleteOne({ _id: id });
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

// Update banner status
const updateBannerStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "banner");
    }

    await bannerModel.findByIdAndUpdate(
      id,
      [
        {
          $set: {
            status: {
              $cond: [{ $eq: ["$status", "Publish"] }, "UnPublish", "Publish"],
            },
          },
        },
      ],
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL + "banner");
  }
};

// ------- PUBLIC API (for Flutter) -------
const getAllBannerPublic = async (_req, res) => {
  try {
    const banners = await bannerModel
      .find({ status: "Publish" }, { status: 0 }) // exclude status from docs (optional)
      .populate({
        path: "newsId",
        select: "_id image title description publishedAt status",
      })
      .sort({ createdAt: -1 })
      .lean();

    // keep only banners with a valid, published news
    const filtered = banners.filter(
      (b) => b.newsId && b.newsId.status === "Publish"
    );

    // optional: trim heavy description for the list payload
    const trimmed = filtered.map((b) => ({
      ...b,
      newsId: {
        ...b.newsId,
        description:
          typeof b.newsId.description === "string"
            ? b.newsId.description.slice(0, 600) // keep first ~600 chars
            : b.newsId.description,
      },
    }));

    return res.json({
      data: {
        success: 1,
        banner: trimmed,
        message: "Banner list fetched successfully",
      },
    });
  } catch (err) {
    console.error("getAllBannerPublic error:", err);
    return res.status(500).json({
      data: { success: 2, message: err.message || "Something went wrong" },
    });
  }
};

module.exports = {
  loadAddBanner,
  addBanner,
  loadBanner,
  loadEditBanner,
  editBanner,
  deleteBanner,
  updateBannerStatus,
  getAllBannerPublic,
};
