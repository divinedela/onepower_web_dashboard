const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const {
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listNews,
  getNews,
} = require("../services/supabaseContentService");
const { bucket } = require("../config/firebaseAdmin");

// --- helpers: firebase deletes + uploads ---
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
  } catch {
    // ignore
  }
};

const cleanupUploadedReqFile = async (file) => {
  if (!file) return;
  const p = file?.firebaseStorage?.path || file?.path || file?.publicUrl;
  if (p) await deleteFromFirebaseByUrlOrPath(p);
};

const getUploadedImageUrl = (req) =>
  req.files?.image?.[0]?.publicUrl || req.file?.publicUrl || null;

// --- controllers ---

const mapNews = (n) =>
  n
    ? {
        ...n,
        _id: n.id,
        title: n.title,
        name: n.title,
      }
    : null;

const mapBanner = (b) =>
  b
    ? {
        ...b,
        _id: b.id,
        newsId: b.news ? { ...b.news, _id: b.news.id, title: b.news.title, name: b.news.title } : b.news_id,
      }
    : null;

const loadAddBanner = async (req, res) => {
  try {
    const newsData = (await listNews()).map(mapNews);
    return res.render("addBanner", { newsData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

const addBanner = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);
    if (!(admin && Number(admin.isAdmin ?? admin.is_admin ?? 0) === 1)) {
      await cleanupUploadedReqFile(req.file);
      req.flash("error", "You have no access to add banner. Only admin has access.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    const { title, newsId } = req.body;
    const imageUrl = getUploadedImageUrl(req);

    if (!title || !newsId || !imageUrl) {
      await cleanupUploadedReqFile(req.file);
      req.flash("error", "Please select news, title and upload an image.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    const news = await getNews(newsId);
    if (!news) {
      await cleanupUploadedReqFile(req.file);
      req.flash("error", "Selected news not found.");
      return res.redirect(process.env.BASE_URL + "add-banner");
    }

    await createBanner({ title, image: imageUrl, news_id: newsId });
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log("addBanner error:", error.message);
    await cleanupUploadedReqFile(req.file);
    req.flash("error", "Failed to add banner");
    return res.redirect(process.env.BASE_URL + "add-banner");
  }
};

const loadBanner = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const banner = (await listBanners({ includeNews: true })).map(mapBanner);
      const loginData = res.locals.admin ? [res.locals.admin] : [];
      return res.render("banner", { banner, loginData, IMAGE_URL: "" });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

const loadEditBanner = async (req, res) => {
  try {
    const id = req.query.id;
    const banner =
      (await listBanners({ includeNews: true }))
        .map(mapBanner)
        .find((b) => b._id === id) || null;
    const newsData = (await listNews()).map(mapNews);
    return res.render("editBanner", { banner, IMAGE_URL: "", newsData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

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

    const news = await getNews(newsId);
    if (!news) {
      req.flash("error", "Selected news not found.");
      return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
    }

    if (newUrl) {
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = newUrl;
    }

    await updateBanner(id, { title, image, news_id: newsId });
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log("editBanner error:", error.message);
    req.flash("error", "Failed to edit banner");
    return res.redirect(process.env.BASE_URL + "edit-banner?id=" + id);
  }
};

const deleteBannerController = async (req, res) => {
  try {
    const id = req.query.id;
    const banner = (await listBanners()).find((b) => b.id === id) || null;
    if (!banner) {
      req.flash("error", "Banner not found.");
      return res.redirect(process.env.BASE_URL + "banner");
    }
    if (banner.image) await deleteFromFirebaseByUrlOrPath(banner.image);
    await deleteBanner(id);
    return res.redirect(process.env.BASE_URL + "banner");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete banner");
    return res.redirect(process.env.BASE_URL + "banner");
  }
};

const updateBannerStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "banner");
    }
    const banner = (await listBanners()).find((b) => b.id === id) || null;
    if (!banner) {
      req.flash("error", "Banner not found.");
      return res.redirect(process.env.BASE_URL + "banner");
    }
    const nextStatus = banner.status === "Publish" ? "UnPublish" : "Publish";
    await updateBanner(id, { status: nextStatus });
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
    const banners = await listBanners({ includeNews: true });
    const filtered = banners.filter((b) => b.status === "Publish" && b.news?.status === "Publish");
    const trimmed = filtered.map((b) => ({
      ...b,
      news: b.news
        ? {
            ...b.news,
            description:
              typeof b.news.description === "string"
                ? b.news.description.slice(0, 600)
                : b.news.description,
          }
        : null,
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
  deleteBanner: deleteBannerController,
  updateBannerStatus,
  getAllBannerPublic,
};
