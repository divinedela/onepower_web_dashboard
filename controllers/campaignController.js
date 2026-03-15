// controllers/campaignController.firebase.js
// Updated to work with Busboy/Sharp/Firebase upload middlewares that set:
//   req.files[field][i].publicUrl  // full downloadable URL
//   req.files[field][i].path       // GCS object path (e.g., "uploads/123.webp")

// Importing models
const campaignModel = require("../model/campaignModel");
const categoryModel = require("../model/categoryModel");
const bannerModel = require("../model/bannerModel");
const donationModel = require("../model/donationModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Firebase bucket (for deletes)
const { bucket } = require("../config/firebaseAdmin");

// Importing services
const combineCampaignAndDonation = require("../services/combineCampaignAndDonation");
const { fetchAllUserToken } = require("../services/sendNotification");

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
    // ignore if not found or any transient error
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

// ---------------- Controllers ----------------

// Load view for adding a campaign
const loadAddCampaign = async (req, res) => {
  try {
    const categoryData = await categoryModel.find();
    return res.render("addCampaign", { categoryData });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load add campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// Add a new campaign
const addCampaign = async (req, res) => {
  try {
    const loginData = await adminLoginModel.findById(req.session.userId);

    // Demo admin guard
    if (loginData && loginData.isAdmin === 0) {
      await cleanupUploadedReqFiles(req.files);
      req.flash(
        "error",
        "You do not have permission to add campaign. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // Dates valid?
    if (req.body.ending_date < req.body.starting_date) {
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // Extract
    const name = req.body.name;
    const categoryId = req.body.categoryId;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = req.body.amount;
    const organizer_name = req.body.Organizer_name; // incoming field name kept
    const description = req.body.description.replace(/"/g, "&quot;");
    const notification_title = req.body.notification_title;
    const notification_message = req.body.notification_message.replace(
      /"/g,
      "&quot;"
    );

    // Files from Firebase middleware
    const image = req.files?.image?.[0]?.publicUrl || null;
    const organizer_image = req.files?.organizer_image?.[0]?.publicUrl || null;
    const gallery = (req.files?.gallery || []).map((f) => f.publicUrl);

    // Save
    const newCampaign = await new campaignModel({
      name,
      categoryId,
      starting_date,
      ending_date,
      campaign_amount: amount,
      organizer_name,
      description,
      image,
      organizer_image,
      gallery,
    }).save();

    if (!newCampaign) {
      await cleanupUploadedReqFiles(req.files); // rollback uploaded files if DB save failed
      req.flash(
        "error",
        "Campaign could not be added. Please make sure all required fields are filled."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // push notification
    await fetchAllUserToken(notification_title, notification_message);

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    await cleanupUploadedReqFiles(req.files);
    req.flash("error", "Failed to add campaign");
    return res.redirect(process.env.BASE_URL + "add-campaign");
  }
};

// Load view for all campaign
const loadCampaign = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const campaign = await campaignModel
        .find({ isUser: false })
        .populate("categoryId")
        .sort({ createdAt: -1 });

      const updatedCampaignData = await combineCampaignAndDonation(campaign);
      const loginData = await adminLoginModel.find();

      // IMAGE_URL blank so <%= IMAGE_URL + image %> works with full URLs
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

// Load view for all user campaign
const loadUserCampaign = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const campaign = await campaignModel
        .find({ isUser: true })
        .populate("categoryId userId")
        .sort({ createdAt: -1 });

      const updatedCampaignData = await combineCampaignAndDonation(campaign);
      const loginData = await adminLoginModel.find();

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

// Load view for specific campaign info
const loadCampaignInfo = async (req, res) => {
  try {
    const id = req.query.id;
    const campaign = await campaignModel.findById(id).populate("userId");
    const donor = await donationModel
      .find({ campaignId: id })
      .populate("userId campaignId");
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

// Load view for editing a campaign
const loadEditCampaign = async (req, res) => {
  try {
    const id = req.query.id;
    const campaign = await campaignModel.findById(id);
    const categoryData = await categoryModel.find();

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

// Edit a campaign
const editCampaign = async (req, res) => {
  const id = req.body.id;

  try {
    const name = req.body.name;
    const categoryId = req.body.categoryId;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = req.body.amount;
    const organizer_name = req.body.organizer_name;
    const description = req.body.description.replace(/"/g, "&quot;");
    const oldImage = req.body.oldImage; // stored URL string
    const old_organizer_image = req.body.old_organizer_image; // stored URL string

    if (req.body.ending_date < req.body.starting_date) {
      // cleanup any newly uploaded files
      await cleanupUploadedReqFiles(req.files);
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    // Prepare image fields
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

    const updatedCampaign = await campaignModel.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          name,
          categoryId,
          starting_date,
          ending_date,
          campaign_amount: amount,
          organizer_name,
          organizer_image,
          image,
          description,
        },
      },
      { new: true }
    );

    if (!updatedCampaign) {
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

// Delete campaign
const deleteCampaign = async (req, res) => {
  try {
    const id = req.query.id;

    // Delete any banners tied to this campaign (images are URLs now)
    const banner = await bannerModel.find({ campaignId: id });
    if (banner && banner.length > 0) {
      await Promise.allSettled(
        banner.map((b) => deleteFromFirebaseByUrlOrPath(b.image))
      );
    }

    // Campaign images
    const campaignData = await campaignModel.findById(id);
    if (campaignData) {
      await deleteFromFirebaseByUrlOrPath(campaignData.image);
      await deleteFromFirebaseByUrlOrPath(campaignData.organizer_image);
      if (Array.isArray(campaignData.gallery)) {
        await Promise.allSettled(
          campaignData.gallery.map((g) => deleteFromFirebaseByUrlOrPath(g))
        );
      }
    }

    // Delete DB docs
    await bannerModel.deleteMany({ campaignId: id });
    await donationModel.deleteMany({ campaignId: id });
    await campaignModel.deleteOne({ _id: id });

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// Approve campaign
const approveCampaign = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    const campaign = await campaignModel.findById(id);
    if (!campaign) {
      req.flash("error", "Campaign not found");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    await campaignModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isApproved: campaign.isApproved === true ? false : true,
          status: campaign.isApproved === true ? "UnPublish" : "Publish",
        },
      },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "user-campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to approve campaign");
    return res.redirect(process.env.BASE_URL + "user-campaign");
  }
};

// Update campaign status
const updateCampaignStatus = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "campaign");
    }

    await campaignModel.findByIdAndUpdate(
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

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL + "campaign");
  }
};

// Load the gallery images for a specific campaign
const loadGallery = async (req, res) => {
  try {
    const id = req.query.id;
    const galleryImages = await campaignModel.findById(id);
    const loginData = await adminLoginModel.find();

    return res.render("gallery", { galleryImages, loginData, IMAGE_URL: "" });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load gallery");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// Add gallery image
const addGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    const galleryImageUrl = req.file?.publicUrl;
    if (!galleryImageUrl) {
      req.flash("error", "No image uploaded.");
      return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
    }

    const existing = await campaignModel.findById(id);
    const gallery = (existing?.gallery || []).concat(galleryImageUrl);

    await campaignModel.updateOne({ _id: id }, { $set: { gallery } });
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

// Edit gallery image (replace one URL with another)
const editGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    const oldImage = req.body.oldImage; // URL string stored in DB
    let galleryImage = oldImage;

    if (req.file?.publicUrl) {
      await deleteFromFirebaseByUrlOrPath(oldImage);
      galleryImage = req.file.publicUrl;
    }

    await campaignModel.findOneAndUpdate(
      { _id: id, gallery: oldImage },
      { $set: { "gallery.$": galleryImage } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

// Delete gallery image
const deleteGalleryImage = async (req, res) => {
  const id = req.query.id;
  try {
    const galleryUrl = req.query.name; // previously filename; now URL
    await deleteFromFirebaseByUrlOrPath(galleryUrl);

    await campaignModel.findByIdAndUpdate(
      { _id: id },
      { $pull: { gallery: { $in: [galleryUrl] } } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

// Load donation
const loadDonation = async (req, res) => {
  try {
    const id = req.query.id;
    const campaignData = await campaignModel.findById(id);
    const updatedCampaignData = await combineCampaignAndDonation(campaignData);
    const donor = await donationModel
      .find({ campaignId: id })
      .populate("userId campaignId");

    return res.render("donation", {
      campaign: updatedCampaignData,
      donor,
      IMAGE_URL: "",
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load donation");
    return res.redirect(process.env.BASE_URL + "campaign");
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
  deleteCampaign,
  approveCampaign,
  updateCampaignStatus,
  loadGallery,
  addGalleryImage,
  editGalleryImage,
  deleteGalleryImage,
  loadDonation,
};
