// Importing models
const campaignModel = require("../model/campaignModel");
const categoryModel = require("../model/categoryModel");
const bannerModel = require("../model/bannerModel");
const donationModel = require("../model/donationModel");
const adminLoginModel = require("../model/adminLoginModel");
const { verifyAdminAccess } = require("../config/verification");

// Importing the service function to delete uploaded files
const deleteImage = require("../services/deleteImage");

// Importing the service function to combine campaign and donation
const combineCampaignAndDonation = require("../services/combineCampaignAndDonation");

// Importing the service function to fetch all user token
const { fetchAllUserToken } = require("../services/sendNotification");

// Importing the service function to check if the user is verified
//const { checkVerify, clearConfigData } = require("../services/getConfigstoreInstance");

// Load view for adding a campaign
const loadAddCampaign = async (req, res) => {
  try {
    // Fetch all category data
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

    if (loginData && loginData.isAdmin === 0) {
      deleteImage(req.files["image"][0].filename);
      deleteImage(req.files["organizer_image"][0].filename);
      // Delete images in the gallery if any
      if (req.files && req.files["gallery"]) {
        const galleryImages = req.files["gallery"].map((file) => file.filename);
        for (const galleryImage of galleryImages) {
          deleteImage(galleryImage);
        }
      }

      req.flash(
        "error",
        "You do not have permission to add campaign. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // Check if the starting date is before the ending date
    if (req.body.ending_date < req.body.starting_date) {
      deleteImage(req.files["image"][0].filename);
      deleteImage(req.files["organizer_image"][0].filename);
      // Delete images in the gallery if any
      if (req.files && req.files["gallery"]) {
        const galleryImages = req.files["gallery"].map((file) => file.filename);
        for (const galleryImage of galleryImages) {
          deleteImage(galleryImage);
        }
      }
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // Extract data from the request
    const name = req.body.name;
    const categoryId = req.body.categoryId;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = req.body.amount;
    const organizer_name = req.body.Organizer_name;
    const description = req.body.description.replace(/"/g, "&quot;");
    const image = req.files["image"] ? req.files["image"][0].filename : null;
    const organizer_image = req.files["organizer_image"]
      ? req.files["organizer_image"][0].filename
      : null;
    const gallery = req.files["gallery"]
      ? req.files["gallery"].map((file) => file.filename)
      : [];
    const notification_title = req.body.notification_title;
    const notification_message = req.body.notification_message.replace(
      /"/g,
      "&quot;"
    );

    //save the new campaign
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
      req.flash(
        "error",
        "Campaign could not be added. Please make sure all required fields are filled."
      );
      return res.redirect(process.env.BASE_URL + "add-campaign");
    }

    // send notification to all user
    await fetchAllUserToken(notification_title, notification_message);

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add campaign");
    return res.redirect(process.env.BASE_URL + "add-campaign");
  }
};

// Load view for all campaign
const loadCampaign = async (req, res) => {
  try {
    // check if the user is verified
    await verifyAdminAccess(req, res, async () => {
      // Fetch all campaign data
      const campaign = await campaignModel
        .find({ isUser: false })
        .populate("categoryId")
        .sort({ createdAt: -1 });

      const updatedCampaignData = await combineCampaignAndDonation(campaign);

      const loginData = await adminLoginModel.find();

      return res.render("campaign", {
        campaign: updatedCampaignData,
        loginData,
        IMAGE_URL: process.env.IMAGE_URL,
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
        IMAGE_URL: process.env.IMAGE_URL,
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
      IMAGE_URL: process.env.IMAGE_URL,
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load campaign info");
    return res.redirect(process.env.BASE_URL + "user-campaign");
  }
};

// Load view for editing an campaign
const loadEditCampaign = async (req, res) => {
  try {
    // Extract data from the request
    const id = req.query.id;

    // Fetch all campaign data
    const campaign = await campaignModel.findById(id);

    // Fetch all category data
    const categoryData = await categoryModel.find();

    return res.render("editCampaign", {
      campaign,
      categoryData,
      IMAGE_URL: process.env.IMAGE_URL,
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load edit campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// Edit an campaign
const editCampaign = async (req, res) => {
  const id = req.body.id;

  try {
    // Extract data from the request
    const name = req.body.name;
    const categoryId = req.body.categoryId;
    const starting_date = req.body.starting_date;
    const ending_date = req.body.ending_date;
    const amount = req.body.amount;
    const organizer_name = req.body.organizer_name;
    const description = req.body.description.replace(/"/g, "&quot;");
    const oldImage = req.body.oldImage;
    const old_organizer_image = req.body.old_organizer_image;

    // Check if the starting date is before the ending date
    if (req.body.ending_date < req.body.starting_date) {
      if (req.files && req.files["image"] && req.files["image"][0]) {
        // Delete old image
        deleteImage(req.files["image"][0].filename);
      }
      if (
        req.files &&
        req.files["organizer_image"] &&
        req.files["organizer_image"][0]
      ) {
        // Delete old image
        deleteImage(req.files["organizer_image"][0].filename);
      }
      req.flash("error", "Ending date must be after starting date.");
      return res.redirect(process.env.BASE_URL + "edit-campaign?id=" + id);
    }

    let image = oldImage;
    if (req.files && req.files["image"] && req.files["image"][0]) {
      // Delete old image
      deleteImage(oldImage);
      image = req.files["image"][0].filename;
    }

    let organizer_image = old_organizer_image;
    if (
      req.files &&
      req.files["organizer_image"] &&
      req.files["organizer_image"][0]
    ) {
      // Delete old image
      deleteImage(old_organizer_image);
      organizer_image = req.files["organizer_image"][0].filename;
    }

    //update specific campaign
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

//delete campaign
const deleteCampaign = async (req, res) => {
  try {
    const id = req.query.id;

    // Fetch all banner data specific campaign
    const banner = await bannerModel.find({ campaignId: id });

    // Delete banner images
    if (banner && banner.length > 0) {
      banner.forEach((item) => {
        deleteImage(item.image);
      });
    }

    // Fetch all campaign
    const campaignData = await campaignModel.findById(id);

    // Delete campaign image, organizer image and gallery
    if (campaignData) {
      deleteImage(campaignData.image);
      deleteImage(campaignData.organizer_image);

      // Delete gallery images
      campaignData.gallery.forEach((item) => {
        deleteImage(item);
      });
    }

    //delete banner
    await bannerModel.deleteMany({ campaignId: id });

    //delete donor
    await donationModel.deleteMany({ campaignId: id });

    //delete campaign
    await campaignModel.deleteOne({ _id: id });

    return res.redirect(process.env.BASE_URL + "campaign");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete campaign");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// approve campaign
const approveCampaign = async (req, res) => {
  try {
    // Extract data from the request query
    const id = req.query.id;

    // Validate id
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    // Find the current campaign using the ID
    const campaign = await campaignModel.findById(id);

    // Check if campaign exists
    if (!campaign) {
      req.flash("error", "Campaign not found");
      return res.redirect(process.env.BASE_URL + "user-campaign");
    }

    // Toggle status
    const updatedCampaign = await campaignModel.findByIdAndUpdate(
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

// update campaign status
const updateCampaignStatus = async (req, res) => {
  try {
    // Extract data from the request query
    const id = req.query.id;

    // Validate id
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "campaign");
    }

    // Update campaign status in a single query
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
    // Extract data from the request
    const id = req.query.id;

    const galleryImages = await campaignModel.findById(id);

    // fetch admin
    const loginData = await adminLoginModel.find();

    return res.render("gallery", {
      galleryImages,
      loginData,
      IMAGE_URL: process.env.IMAGE_URL,
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load gallery");
    return res.redirect(process.env.BASE_URL + "campaign");
  }
};

// add gallery image
const addGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    // Extract data from the request
    const id = req.body.id;
    const galleryImage = req.file.filename;

    // Find the existing gallery entry
    const existingGallery = await campaignModel.findById(id);

    // Check if the gallery field is null and initialize it if necessary
    const gallery = existingGallery.gallery || [];

    // Update the gallery field with new images
    await campaignModel.updateOne(
      { _id: id },
      { $set: { gallery: gallery.concat(galleryImage) } }
    );

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

//edit gallery image
const editGalleryImage = async (req, res) => {
  const id = req.body.id;
  try {
    // Extract data from the request

    const oldImage = req.body.oldImage;

    let galleryImage = oldImage;

    if (req.file) {
      // Delete the old image
      deleteImage(oldImage);
      galleryImage = req.file.filename;
    }

    // Update the gallery images
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

//delete gallery image
const deleteGalleryImage = async (req, res) => {
  const id = req.query.id;
  try {
    // Extract data from the request
    const gallery = req.query.name;

    // Delete the old image
    deleteImage(gallery);

    //delete specific gallery image
    await campaignModel.findByIdAndUpdate(
      { _id: id },
      { $pull: { gallery: { $in: [gallery] } } },
      { new: true }
    );

    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete gallery image");
    return res.redirect(process.env.BASE_URL + "gallery?id=" + id);
  }
};

// Load view for specific campaign donation detalis
const loadDonation = async (req, res) => {
  try {
    // Extract data from the request
    const id = req.query.id;
    const currentDate = new Date().toISOString().split("T")[0];

    // Fetch campaign data
    const campaignData = await campaignModel.findById(id);

    const updatedCampaignData = await combineCampaignAndDonation(campaignData);

    // Fetch donation data for the campaign
    const donor = await donationModel
      .find({ campaignId: id })
      .populate("userId campaignId");

    return res.render("donation", {
      campaign: updatedCampaignData,
      donor,
      IMAGE_URL: process.env.IMAGE_URL,
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
