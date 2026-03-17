// controllers/categoryController.firebase.js
// Works with your Busboy/Sharp/Firebase single uploader that sets:
//   req.file.publicUrl  // full downloadable URL
//   req.file.path       // GCS object path (e.g., "uploads/123.webp")

const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listCampaigns,
  deleteCampaignsByCategory,
  deleteDonationsByCampaignIds,
} = require("../services/supabaseContentService");

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
const mapCategory = (c) => (c ? { ...c, _id: c.id } : null);

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
    const loginData = await findAdminById(req.session.userId);

    // Demo admin: deny & cleanup any uploaded file
    if (loginData && Number(loginData.isAdmin ?? loginData.is_admin ?? 0) === 0) {
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

    await createCategory({ name, image });
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
      const category = (await listCategories()).map(mapCategory);
      const loginData = res.locals.admin ? [res.locals.admin] : [];

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
    const category = mapCategory(await getCategory(id));
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

    await updateCategory(id, { name, image });

    return res.redirect(process.env.BASE_URL + "category");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit category");
    return res.redirect(process.env.BASE_URL + "edit-category?id=" + id);
  }
};

// Delete a category (and related media in Firebase)
const deleteCategoryController = async (req, res) => {
  try {
    const id = req.query.id;

    const category = await getCategory(id);
    if (!category) {
      req.flash("error", "Category not found.");
      return res.redirect(process.env.BASE_URL + "category");
    }

    // Fetch campaigns in this category
    const campaigns = await listCampaigns({ categoryId: id });
    const campaignIds = campaigns.map((c) => c.id);

    // Delete associated media
    if (campaigns?.length) {
      const mediaJobs = [];
      for (const c of campaigns) {
        mediaJobs.push(deleteFromFirebaseByUrlOrPath(c.image));
        mediaJobs.push(deleteFromFirebaseByUrlOrPath(c.organizer_image));
        if (Array.isArray(c.gallery)) {
          for (const g of c.gallery) mediaJobs.push(deleteFromFirebaseByUrlOrPath(g));
        }
      }
      await Promise.allSettled(mediaJobs);
    }

    // Delete category image itself
    if (category.image) {
      await deleteFromFirebaseByUrlOrPath(category.image);
    }

    // Remove DB docs in order: donations -> campaigns -> category
    if (campaignIds.length) {
      await deleteDonationsByCampaignIds(campaignIds);
      await deleteCampaignsByCategory(id);
    }
    await deleteCategory(id);

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

    const category = await getCategory(id);
    if (!category) {
      req.flash("error", "Category not found.");
      return res.redirect(process.env.BASE_URL + "category");
    }
    const nextStatus = category.status === "Publish" ? "UnPublish" : "Publish";
    await updateCategory(id, { status: nextStatus });

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
  deleteCategory: deleteCategoryController,
  updateCategoryStatus,
};
