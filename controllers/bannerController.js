// controllers/bannerController.firebase.js
// Works with Busboy/Sharp/Firebase upload middleware that sets:
//   req.file.publicUrl              // full downloadable URL
//   req.file.path OR firebaseStorage.path // GCS object path (e.g., "uploads/123.webp")

// Models
const bannerModel = require("../model/bannerModel");
const campaignModel = require("../model/campaignModel");
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

const cleanupUploadedReqFile = async (file) => {
  if (!file) return;
  const p = file?.firebaseStorage?.path || file?.path || file?.publicUrl;
  if (p) await deleteFromFirebaseByUrlOrPath(p);
};

// Robust getter to support .single('image') OR .fields([{name:'image'}])
const getUploadedImageUrl = (req) =>
  req.file?.publicUrl ||
  req.files?.image?.[0]?.publicUrl ||
  req.file?.url ||
  req.files?.image?.[0]?.url ||
  null;

// ---------------- Controllers ----------------

// Load view for adding a Banner
const loadAddBanner = async (req, res) => {
  try {
    const campaignData = await campaignModel.find();
    return res.render("addBanner", { campaignData });
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
      // No access: best-effort cleanup of uploaded file
      await cleanupUploadedReqFile(req.file || req.files?.image?.[0]);
      req.flash(
        "error",
        "You have no access to add banner. Only admin has access to this functionality."
      );
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    const title = req.body.title;
    const campaignId = req.body.campaignId;

    const imageUrl = getUploadedImageUrl(req);
    if (!imageUrl) {
      await cleanupUploadedReqFile(req.file || req.files?.image?.[0]);
      req.flash("error", "Please upload an image for the banner.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    await new bannerModel({ title, image: imageUrl, campaignId }).save();
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log(error.message);
    await cleanupUploadedReqFile(req.file || req.files?.image?.[0]);
    req.flash("error", "Failed to add banner");
    return res.redirect(process.env.BASE_URL + "add-banner");
  }
};

// Load view for all Banners
const loadBanner = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const banner = await bannerModel.find().populate("campaignId");
      const loginData = await adminLoginModel.find();

      // IMAGE_URL left blank; views should resolve absolute Firebase URLs directly
      return res.render("banner", {
        banner,
        loginData,
        IMAGE_URL: "",
      });
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
    const campaignData = await campaignModel.find();
    const banner = await bannerModel.findById(id);

    return res.render("editBanner", {
      banner,
      IMAGE_URL: "",
      campaignData,
    });
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
    const title = req.body.title;
    const campaignId = req.body.campaignId;
    const oldImage = req.body.oldImage; // URL string stored in DB

    let image = oldImage;
    const uploaded = req.file || req.files?.image?.[0];
    if (uploaded?.publicUrl) {
      // replace: delete old then use new URL
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = uploaded.publicUrl;
    }

    await bannerModel.findOneAndUpdate(
      { _id: id },
      { $set: { title, image, campaignId } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit banner");
    return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
  }
};

// Delete a Banner
const deleteBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const doc = await bannerModel.findById(id);

    if (doc?.image) {
      await deleteFromFirebaseByUrlOrPath(doc.image);
    }
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
              $cond: {
                if: { $eq: ["$status", "Publish"] },
                then: "UnPublish",
                else: "Publish",
              },
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

module.exports = {
  loadAddBanner,
  addBanner,
  loadBanner,
  loadEditBanner,
  editBanner,
  deleteBanner,
  updateBannerStatus,
};
