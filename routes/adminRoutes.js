// Importing required modules 
const express = require("express");

// Create an instance of the express router
const routes = express();

// Configure EJS as the templating engine
routes.set('view engine', 'ejs');

// Configure the views directory for "static-files"
routes.set('views', './views/admin');

// Configure static files
routes.use(express.static('public'));

// Importing middleware functions for admin authentication
const { isLogin, isLogout } = require("../middleware/auth");

// Importing middleware function to uploaded  file
const { uploadImage } = require("../middleware/uploadSingleFile");
const multiplefile = require("../middleware/uploadMultipleFile");

// Import controllers
const loginController = require("../controllers/loginController");
const introController = require("../controllers/introController");
const categoryController = require("../controllers/categoryController");
const bannerController = require("../controllers/bannerController");
const campaignController = require("../controllers/campaignController");
const userController = require("../controllers/userController");
const paymentController = require("../controllers/paymentController");
const pageController = require("../controllers/pageController");
const notificationController = require("../controllers/notificationController");
const currencyController = require("../controllers/currencyController");
const verificationController = require("../controllers/verificationController");

// Routes For Login
routes.get("", isLogout, loginController.loadLogin);

routes.post("", loginController.login);

// Routes For Profile
routes.get("/profile", isLogin, loginController.loadProfile);

routes.get("/edit-profile", isLogin, loginController.loadEditProfile);

routes.post("/edit-profile", uploadImage, loginController.editProfile);

//Routes For Change Password
routes.get("/change-password", isLogin, loginController.loadChangePassword);

routes.post("/change-password", loginController.changePassword);

//Routes For Dashboard
routes.get("/dashboard", isLogin, loginController.loadDashboard);

//Routes For Intro
routes.get("/add-intro", isLogin, introController.loadAddIntro);

routes.post("/add-intro", uploadImage, introController.addIntro);

routes.get("/intro", isLogin, introController.loadIntro);

routes.get("/edit-intro", isLogin, introController.loadEditIntro);

routes.post("/edit-intro", uploadImage, introController.editIntro);

routes.get("/delete-intro", isLogin, introController.deleteIntro);

routes.get("/intro-status", isLogin, introController.updateIntroStatus);

//Routes For Category
routes.get("/add-category", isLogin, categoryController.loadAddCategory);

routes.post("/add-category", uploadImage, categoryController.addCategory);

routes.get("/category", isLogin, categoryController.loadCategory);

routes.get("/edit-category", isLogin, categoryController.loadEditCategory);

routes.post("/edit-category", uploadImage, categoryController.editCategory);

routes.get("/delete-category", categoryController.deleteCategory);

routes.get("/category-status", categoryController.updateCategoryStatus);

//Routes For Banner
routes.get("/add-banner", isLogin, bannerController.loadAddBanner);

routes.post("/add-banner", uploadImage, bannerController.addBanner);

routes.get("/banner", isLogin, bannerController.loadBanner);

routes.get("/edit-banner", isLogin, bannerController.loadEditBanner);

routes.post("/edit-banner", uploadImage, bannerController.editBanner);

routes.get("/delete-banner", isLogin, bannerController.deleteBanner);

routes.get("/banner-status", bannerController.updateBannerStatus);

//Routes For Campaign
routes.get("/add-campaign", isLogin, campaignController.loadAddCampaign);

routes.post("/add-campaign", multiplefile, campaignController.addCampaign);

routes.get("/campaign", isLogin, campaignController.loadCampaign);

routes.get("/user-campaign", isLogin, campaignController.loadUserCampaign);

routes.get("/campaign-info", isLogin, campaignController.loadCampaignInfo);

routes.get("/edit-campaign", isLogin, campaignController.loadEditCampaign);

routes.post("/edit-campaign", multiplefile, campaignController.editCampaign);

routes.get("/delete-campaign", isLogin, campaignController.deleteCampaign);

routes.get("/campaign-status", campaignController.updateCampaignStatus);

routes.get("/approve-campaign", campaignController.approveCampaign);

//Routes For Gallery
routes.get("/gallery", isLogin, campaignController.loadGallery);

routes.post("/add-gallery", uploadImage, campaignController.addGalleryImage);

routes.post("/edit-gallery", uploadImage, campaignController.editGalleryImage);

routes.get("/delete-gallery", isLogin, campaignController.deleteGalleryImage);

// Routes For Donation
routes.get("/donation", isLogin, campaignController.loadDonation);

//Routes For Donor
routes.get("/donor", isLogin, userController.loadDonor);

//Routes For User
routes.get("/user", isLogin, userController.loadUser);

// Routes For Notification
routes.get("/notification", isLogin, notificationController.loadNotification);

routes.get("/get-notification", notificationController.notification);

routes.get("/push-notification", isLogin, notificationController.loadSendNotification);

routes.post("/push-notification", isLogin, notificationController.sendAllUserNotification);

// Routes For Payment Gateway
routes.get("/payment-gateway", isLogin, paymentController.loadPaymentGateway);

routes.post("/edit-stripe-payment-method", paymentController.editStripePaymentMethod);

routes.post("/edit-paypal-payment-method", paymentController.editPaypalPaymentMethod);

routes.post("/edit-razorpay-payment-method", paymentController.editRazorpayPaymentMethod);

routes.get("/active-user", isLogin, userController.isActivate);

// Routes For Pages
routes.get("/private-policy", isLogin, pageController.loadPrivatePolicy);

routes.post("/add-private-policy", pageController.addPrivatePolicy);

routes.get("/terms-and-condition", isLogin, pageController.loadTermsAndCondition);

routes.post("/add-terms-and-condition", pageController.addTermsAndCondition);

routes.get("/about-us", isLogin, pageController.loadAboutUs);

routes.post("/add-about-us", pageController.addAboutUs);

// Routes For Verification
// routes.get("/verification", isLogin, verificationController.loadVerification);

// routes.post("/verify-key", verificationController.verifyKey);

// routes.post("/revoke-key", verificationController.revokeKey);

// Routes For Currency
routes.get("/currency", isLogin, currencyController.loadCurrency);

routes.post("/add-currency", currencyController.addCurrency);

// Routes For Mail Config
routes.get("/mail-config", isLogin, loginController.loadMailConfig);

routes.post("/mail-config", loginController.mailConfig);

//Routes For Logout
routes.get("/logout", isLogin, loginController.logout);

// Routes For Verification
routes.get("/verification", isLogin, verificationController.loadVerification);

routes.post("/verification", verificationController.keyVerification);

routes.post("/revoke", verificationController.revokeKey);


routes.get("*", async (req, res) => {
    res.redirect('/')
})

module.exports = routes;