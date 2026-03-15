// controllers/categoryController.firebase.js
// Works with your Busboy/Sharp/Firebase single uploader that sets:
//   req.file.publicUrl  // full downloadable URL
//   req.file.path       // GCS object path (e.g., "uploads/123.webp")

const campaignModel = require("../model/campaignModel");
const categoryModel = require("../model/categoryModel");
const bannerModel = require("../model/bannerModel");
const donationModel = require("../model/donationModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Firebase bucket (for deletes)
const { bucket } = require("../config/firebaseAdmin");

/* ---------------- helpers: delete + cleanup ---------------- */

const storagePathFromUrl = (urlOrPath = "") => {
  try {
    if (!urlOrPath) return null;
    if (/^https?:\/\//i.test(urlOrPath)) {
      // tokenized download URL: .../o/<encodedPath>?alt=media&token=...
      const afterO = urlOrPath.split("/o/")[1];
      if (!afterO) return null;
      const encodedPath = afterO.split("?")[0];
      return decodeURIComponent(encodedPath);
    }
    // already a GCS object path ("uploads/..")
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
  } catch {
    // ignore not-found or transient errors
  }
};

const cleanupUploadedReqFile = async (file) => {
  if (!file) return;
  const p = file?.firebaseStorage?.path || file?.path || file?.publicUrl;
  if (p) await deleteFromFirebaseByUrlOrPath(p);
};

/* ---------------- Controllers ---------------- */

// Load view for adding a category
const loadAddCategory = async (req, res) => {
  try {
    return res.render("addCategory");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load add category");
    return res.redirect(process.env.BASE_URL + "category");
  }
};

// Add a new Category (expects single uploader on field "image")
const addCategory = async (req, res) => {
  try {
    const loginData = await adminLoginModel.findById(req.session.userId);

    // Demo admin: deny & cleanup any uploaded file
    if (loginData && loginData.isAdmin === 0) {
      await cleanupUploadedReqFile(req.file);
      req.flash(
        "error",
        "You don't have permission to add category. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "add-category");
    }

    const name = req.body.name?.trim();
    const image = req.file?.publicUrl || null;

    if (!name) {
      await cleanupUploadedReqFile(req.file);
      req.flash("error", "Category name is required.");
      return res.redirect(process.env.BASE_URL + "add-category");
    }

    if (!image) {
      await cleanupUploadedReqFile(req.file);
      req.flash("error", "Please upload an image for the category.");
      return res.redirect(process.env.BASE_URL + "add-category");
    }

    await new categoryModel({ name, image }).save();
    return res.redirect(process.env.BASE_URL + "category");
  } catch (error) {
    console.log(error.message);
    await cleanupUploadedReqFile(req.file);
    req.flash("error", "Failed to add category");
    return res.redirect(process.env.BASE_URL + "add-category");
  }
};

// Load view for all categories
const loadCategory = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const category = await categoryModel.find();
      const loginData = await adminLoginModel.find();

      // IMAGE_URL blank; views should resolve absolute Firebase URLs directly
      return res.render("category", { category, loginData, IMAGE_URL: "" });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load category");
    return res.redirect(req.get("referer"));
  }
};

// Load view for editing a category
const loadEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await categoryModel.findById(id);
    return res.render("editCategory", { category, IMAGE_URL: "" });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load edit category");
    return res.redirect(req.get("referer"));
  }
};

// Edit a category (replace image if a new one is uploaded)
const editCategory = async (req, res) => {
  const id = req.body.id;
  try {
    const name = req.body.name?.trim();
    const oldImage = req.body.oldImage; // URL string stored in DB

    if (!name) {
      req.flash("error", "Category name is required.");
      return res.redirect(process.env.BASE_URL + "edit-category?id=" + id);
    }

    let image = oldImage;
    if (req.file?.publicUrl) {
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = req.file.publicUrl;
    }

    await categoryModel.findOneAndUpdate(
      { _id: id },
      { $set: { name, image } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "category");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit category");
    return res.redirect(process.env.BASE_URL + "edit-category?id=" + id);
  }
};

// Delete a category (and related media in Firebase)
const deleteCategory = async (req, res) => {
  try {
    const id = req.query.id;

    // Fetch campaigns in this category
    const campaigns = await campaignModel.find({ categoryId: id });

    // Delete each campaign's images (main, organizer, gallery)
    if (campaigns?.length) {
      const mediaJobs = [];
      for (const c of campaigns) {
        mediaJobs.push(deleteFromFirebaseByUrlOrPath(c.image));
        mediaJobs.push(deleteFromFirebaseByUrlOrPath(c.organizer_image));
        if (Array.isArray(c.gallery)) {
          for (const g of c.gallery)
            mediaJobs.push(deleteFromFirebaseByUrlOrPath(g));
        }
      }
      await Promise.allSettled(mediaJobs);
    }

    // Banners tied to those campaigns
    const campaignIds = campaigns.map((c) => c._id);
    const banners = campaignIds.length
      ? await bannerModel.find({ campaignId: { $in: campaignIds } })
      : [];

    if (banners?.length) {
      await Promise.allSettled(
        banners.map((b) => deleteFromFirebaseByUrlOrPath(b.image))
      );
    }

    // Delete category image itself
    const categoryDoc = await categoryModel.findById(id);
    if (categoryDoc?.image) {
      await deleteFromFirebaseByUrlOrPath(categoryDoc.image);
    }

    // Remove DB docs in the right order
    if (campaignIds.length) {
      await bannerModel.deleteMany({ campaignId: { $in: campaignIds } });
      await donationModel.deleteMany({ campaignId: { $in: campaignIds } });
      await campaignModel.deleteMany({ categoryId: id });
    }
    await categoryModel.deleteOne({ _id: id });

    return res.redirect(process.env.BASE_URL + "category");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Failed to delete category");
    return res.redirect(process.env.BASE_URL + "category");
  }
};

// Update category status (Publish/UnPublish)
const updateCategoryStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "category");
    }

    await categoryModel.findByIdAndUpdate(
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

    return res.redirect(process.env.BASE_URL + "category");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(process.env.BASE_URL + "category");
  }
};

module.exports = {
  loadAddCategory,
  addCategory,
  loadCategory,
  loadEditCategory,
  editCategory,
  deleteCategory,
  updateCategoryStatus,
};
