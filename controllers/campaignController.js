const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listCategories,
  getCategory,
  listDonations,
  deleteDonationsByCampaignIds,
} = require("../services/supabaseContentService");
const { bucket } = require("../config/firebaseAdmin");
const { fetchAllUserToken } = require("../services/sendNotification");
const combineCampaignAndDonation = require("../services/combineCampaignAndDonation");

// --- numeric helpers ---
const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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
  for (const field in files) {
    for (const f of files[field]) {
      const p = f?.firebaseStorage?.path || f?.path || f?.publicUrl;
      if (p) jobs.push(deleteFromFirebaseByUrlOrPath(p));
    }
  }
  await Promise.allSettled(jobs);
};

const mapCategory = (c) => (c ? { ...c, _id: c.id, name: c.name } : null);
const mapCampaign = (c) =>
  c
    ? {
        ...c,
        _id: c.id,
        categoryId: c.category_id,
        userId: c.user_id,
        campaign_amount: toSafeNumber(c.campaign_amount),
        totalDonationAmount: toSafeNumber(c.totalDonationAmount ?? c.total_donation_amount),
        totalDonors: toSafeNumber(c.totalDonors ?? c.total_donors),
      }
    : null;

// ---------------- Controllers ----------------

const loadAddCampaign = async (req, res) => {
  try {
    const categoryData = (await listCategories()).map(mapCategory);
    return res.render("addCampaign", { categoryData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load add campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const addCampaign = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);

    if (admin && Number(admin.isAdmin ?? admin.is_admin ?? 0) === 0) {
      await cleanupUploadedReqFiles(req.files);
      req.flash(
        "error",
        "You do not have permission to add campaign. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    if (req.body.ending_date < req.body.starting_date) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    const categoryId = req.body.categoryId;
    const category = await getCategory(categoryId);
    if (!category) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Invalid category.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    const name = req.body.name;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = Number(req.body.amount);
    const organizer_name = req.body.Organizer_name;
    const description = (req.body.description || "").replace(/"/g, "&quot;");
    const notification_title = req.body.notification_title || "";
    const notification_message = (req.body.notification_message || "").replace(/"/g, "&quot;");

    if (!Number.isFinite(amount) || amount <= 0) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Amount must be a positive number.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    const image = req.files?.image?.[0]?.publicUrl || null;
    const organizer_image = req.files?.organizer_image?.[0]?.publicUrl || image;
    const gallery = (req.files?.gallery || []).map((f) => f.publicUrl);

    if (!image || !organizer_image) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Main image and organizer image are required.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    const payload = {
      name,
      category_id: categoryId,
      starting_date,
      ending_date,
      campaign_amount: amount,
      organizer_name,
      description,
      image,
      organizer_image,
      gallery,
      is_user: false,
      campaign_status: "Upcoming",
      status: "Publish",
      is_approved: true,
    };

    const created = await createCampaign(payload);
    if (!created) {
      await cleanupUploadedReqFiles(req.files);
      req.flash(
        "error",
        "Campaign could not be added. Please make sure all required fields are filled."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    await fetchAllUserToken(notification_title, notification_message);

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log("addCampaign error", error.response?.data || error.message || error);
    await cleanupUploadedReqFiles(req.files);
    const supabaseMessage =
      error?.response?.data?.message || error?.response?.data?.hint || error.message;
    req.flash("error", supabaseMessage ? `Failed to add project: ${supabaseMessage}` : "Failed to add project");
    return res.redirect(process.env.BASE_URL + "add-campaign");
  }
};

const loadCampaign = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const campaigns = (await listCampaigns({})).filter((c) => c.is_user === false).map(mapCampaign);
      const updatedCampaignData = await combineCampaignAndDonation(campaigns);
      const loginData = res.locals.admin ? [res.locals.admin] : [];

      return res.render("campaign", {
        campaign: updatedCampaignData,
        loginData,
        IMAGE_URL: "",
      });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const loadUserCampaign = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const campaigns = (await listCampaigns({})).filter((c) => c.is_user === true).map(mapCampaign);
      const updatedCampaignData = await combineCampaignAndDonation(campaigns);
      const loginData = res.locals.admin ? [res.locals.admin] : [];

      return res.render("userCampaign", {
        campaign: updatedCampaignData,
        loginData,
        IMAGE_URL: "",
      });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load user campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const loadCampaignInfo = async (req, res) => {
  try {
    const id = req.query.id;
    const campaign = mapCampaign((await listCampaigns({})).find((c) => c.id === id));
    if (!campaign) {
      req.flash("error", "Campaign not found");
      return res.redirect(process.env.BASE_URL + "campaign");
    }
    const donor = await listDonations(); // could filter by campaign_id if needed
    const updatedCampaignData = await combineCampaignAndDonation(campaign);

    return res.render("campaignInfo", {
      campaign: updatedCampaignData,
      donor,
      IMAGE_URL: "",
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load campaign info");
    return res.redirect(process.env.BASE_URL + "user-campaign");
  }
};

const loadEditCampaign = async (req, res) => {
  try {
    const id = req.query.id;
    const campaign = mapCampaign((await listCampaigns({})).find((c) => c.id === id));
    const categoryData = (await listCategories()).map(mapCategory);

    return res.render("editCampaign", {
      campaign,
      categoryData,
      IMAGE_URL: "",
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load edit campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const editCampaign = async (req, res) => {
  const id = req.body.id;

  try {
    const name = req.body.name;
    const categoryId = req.body.categoryId;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = toSafeNumber(req.body.amount);
    const organizer_name = req.body.organizer_name;
    const description = req.body.description.replace(/"/g, "&quot;");
    const oldImage = req.body.oldImage;
    const old_organizer_image = req.body.old_organizer_image;

    if (ending_date < starting_date) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    const category = await getCategory(categoryId);
    if (!category) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Invalid category.");
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Amount must be a positive number.");
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    let image = oldImage;
    if (req.files?.image?.[0]) {
      await deleteFromFirebaseByUrlOrPath(oldImage);
      image = req.files.image[0].publicUrl;
    }

    let organizer_image = old_organizer_image;
    if (req.files?.organizer_image?.[0]) {
      await deleteFromFirebaseByUrlOrPath(old_organizer_image);
      organizer_image = req.files.organizer_image[0].publicUrl;
    }

    const payload = {
      name,
      category_id: categoryId,
      starting_date,
      ending_date,
      campaign_amount: amount,
      organizer_name,
      organizer_image,
      image,
      description,
    };

    const updated = await updateCampaign(id, payload);
    if (!updated) {
      req.flash(
        "error",
        "Campaign could not be updated. Please make sure all required fields are filled."
      );
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit campaign");
    return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
  }
};

const deleteCampaignController = async (req, res) => {
  try {
    const id = req.query.id;

    const campaignData = (await listCampaigns({})).find((c) => c.id === id);
    if (campaignData) {
      await deleteFromFirebaseByUrlOrPath(campaignData.image);
      await deleteFromFirebaseByUrlOrPath(campaignData.organizer_image);
      if (Array.isArray(campaignData.gallery)) {
        await Promise.allSettled(
          campaignData.gallery.map((g) => deleteFromFirebaseByUrlOrPath(g))
        );
      }
    }

    await deleteDonationsByCampaignIds([id]);
    await deleteCampaign(id);

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const approveCampaign = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    const campaign = (await listCampaigns({})).find((c) => c.id === id);
    if (!campaign) {
      req.flash("error", "Campaign not found");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    const nextApproved = campaign.is_approved ? false : true;
    const nextStatus = nextApproved ? "Publish" : "UnPublish";

    await updateCampaign(id, {
      is_approved: nextApproved,
      status: nextStatus,
    });

    return res.redirect(process.env.BASE_URL + "user-campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to approve campaign");
    return res.redirect(process.env.BASE_URL + "user-campaign");
  }
};

const updateCampaignStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "campaign");
    }

    const campaign = (await listCampaigns({})).find((c) => c.id === id);
    if (!campaign) {
      req.flash("error", "Campaign not found");
      return res.redirect(process.env.BASE_URL + "campaign");
    }

    const nextStatus = campaign.status === "Publish" ? "UnPublish" : "Publish";
    await updateCampaign(id, { status: nextStatus });

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL + "campaign");
  }
};

const loadGallery = async (req, res) => {
  try {
    const id = req.query.id;
    const galleryImages = (await listCampaigns({})).find((c) => c.id === id);
    const loginData = res.locals.admin ? [res.locals.admin] : [];

    return res.render("gallery", { galleryImages, loginData, IMAGE_URL: "" });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load gallery");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

const addGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    const galleryImageUrl = req.file?.publicUrl;
    if (!galleryImageUrl) {
      req.flash("error", "No image uploaded.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const existing = (await listCampaigns({})).find((c) => c.id === id);
    const gallery = (existing?.gallery || []).concat(galleryImageUrl);

    await updateCampaign(id, { gallery });
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

const editGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    const oldImage = req.body.oldImage;
    const newImage = req.file?.publicUrl;

    if (!newImage) {
      req.flash("error", "No new image uploaded.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const existing = (await listCampaigns({})).find((c) => c.id === id);
    if (!existing) {
      req.flash("error", "Campaign not found.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const gallery = Array.isArray(existing.gallery) ? [...existing.gallery] : [];
    const idx = gallery.findIndex((g) => g === oldImage);
    if (idx >= 0) gallery[idx] = newImage;
    else gallery.push(newImage);

    await deleteFromFirebaseByUrlOrPath(oldImage);
    await updateCampaign(id, { gallery });

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

const deleteGalleryImage = async (req, res) => {
  const id = req.query.id;
  const image = req.query.image;
  try {
    if (!image) {
      req.flash("error", "No image specified.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const existing = (await listCampaigns({})).find((c) => c.id === id);
    if (!existing) {
      req.flash("error", "Campaign not found.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const gallery = (existing.gallery || []).filter((g) => g !== image);
    await deleteFromFirebaseByUrlOrPath(image);
    await updateCampaign(id, { gallery });

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

module.exports = {
  loadAddCampaign,
  addCampaign,
  loadCampaign,
  loadUserCampaign,
  loadCampaignInfo,
  loadEditCampaign,
  editCampaign,
  deleteCampaign: deleteCampaignController,
  approveCampaign,
  updateCampaignStatus,
  loadGallery,
  addGalleryImage,
  editGalleryImage,
  deleteGalleryImage,
};
