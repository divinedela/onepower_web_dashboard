const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const {
  listNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  listCampaigns,
  getCampaign,
  deleteBannersByNewsId,
} = require("../services/supabaseContentService");
const { bucket } = require("../config/firebaseAdmin");

// --- helpers ---
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

const cleanupUploadedReqFiles = async (files) => {
  if (!files) return;
  const jobs = [];
  if (Array.isArray(files)) {
    for (const f of files) {
      const p = f?.firebaseStorage?.path || f?.path || f?.publicUrl;
      if (p) jobs.push(deleteFromFirebaseByUrlOrPath(p));
    }
  } else {
    for (const field in files) {
      for (const f of files[field]) {
        const p = f?.firebaseStorage?.path || f?.path || f?.publicUrl;
        if (p) jobs.push(deleteFromFirebaseByUrlOrPath(p));
      }
    }
  }
  await Promise.allSettled(jobs);
};

const getUploadedImageUrl = (req) =>
  req.files?.image?.[0]?.publicUrl || req.file?.publicUrl || null;

const mapCampaign = (c) => (c ? { ...c, _id: c.id, name: c.name } : null);
const mapNews = (n) => (n ? { ...n, _id: n.id } : null);

// -------- controllers ----------
const loadNews = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const news = (await listNews()).map(mapNews);
      const loginData = res.locals.admin ? [res.locals.admin] : [];
      return res.render("news", { news, loginData, IMAGE_URL: "" });
    });
  } catch (error) {
    console.log("loadNews error:", error.message);
    req.flash("error", "Failed to load news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

const loadAddNews = async (_req, res) => {
  try {
    const campaigns = (await listCampaigns()).map(mapCampaign);
    return res.render("addNews", { campaigns });
  } catch (error) {
    console.log("loadAddNews error:", error.message);
    req.flash("error", "Failed to load add news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

const addNews = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);
    if (admin && Number(admin.isAdmin ?? admin.is_admin ?? 0) === 0) {
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

    let campaignId = (req.body.campaignId || "").trim();
    if (campaignId) {
      const exists = await getCampaign(campaignId);
      if (!exists) campaignId = "";
    }

    if (!title || !description || !imageUrl) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Please provide title, description and image.");
      return res.redirect(process.env.BASE_URL + "add-news");
    }

    const payload = {
      title,
      description,
      image: imageUrl,
      status: "Publish",
      published_at: new Date().toISOString(),
    };
    if (campaignId) payload.campaign_id = campaignId;

    await createNews(payload);
    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("addNews error:", error.message);
    await cleanupUploadedReqFiles(req.files);
    req.flash("error", "Failed to add news");
    return res.redirect(process.env.BASE_URL + "add-news");
  }
};

const loadEditNews = async (req, res) => {
  try {
    const id = req.query.id;
    const news = mapNews(await getNews(id));
    if (!news) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    const campaigns = (await listCampaigns()).map(mapCampaign);
    return res.render("editNews", { news, IMAGE_URL: "", campaigns });
  } catch (error) {
    console.log("loadEditNews error:", error.message);
    req.flash("error", "Failed to load edit news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

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
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = newUrl;
    }

    const payload = { title, description, image };

    const rawCampaign = (req.body.campaignId || "").trim();
    if (rawCampaign === "") {
      payload.campaign_id = null;
    } else if (rawCampaign) {
      const exists = await getCampaign(rawCampaign);
      if (exists) payload.campaign_id = rawCampaign;
    }

    await updateNews(id, payload);
    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("editNews error:", error.message);
    req.flash("error", "Failed to edit news");
    return res.redirect(process.env.BASE_URL + "edit-news?id=" + id);
  }
};

const deleteNewsController = async (req, res) => {
  try {
    const id = req.query.id;
    const doc = await getNews(id);
    if (!doc) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    if (doc.image) await deleteFromFirebaseByUrlOrPath(doc.image);

    await deleteBannersByNewsId(id);
    await deleteNews(id);
    return res.redirect(process.env.BASE_URL + "news");
  } catch (error) {
    console.log("deleteNews error:", error.message);
    req.flash("error", "Failed to delete news");
    return res.redirect(process.env.BASE_URL + "news");
  }
};

const updateNewsStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "news");
    }
    const doc = await getNews(id);
    if (!doc) {
      req.flash("error", "News not found");
      return res.redirect(process.env.BASE_URL + "news");
    }
    const newStatus = doc.status === "Publish" ? "UnPublish" : "Publish";
    const payload = { status: newStatus };
    if (newStatus === "Publish" && !doc.published_at) {
      payload.published_at = new Date().toISOString();
    }
    await updateNews(id, payload);

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
  deleteNews: deleteNewsController,
  updateNewsStatus,
};
