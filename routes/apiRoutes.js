// routes/apiRoutes.js

const express = require("express");
const routes = express.Router();

const { uploadAvatar } = require("../middleware/upload.single.stream");
const { checkAuthentication } = require("../middleware/checkAuthentication");
const apiController = require("../controllers/apiController");
const paymentController = require("../controllers/paymentController");
const { verifyAccess } = require("../config/verification");

// --- SIMPLE TEST ENDPOINT (no auth, no controller) ---
routes.post("/test", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "working",
    route: "/api/test",
    ts: new Date().toISOString(),
    requestId: req.id || null,
  });
});

// Routes For Sign Up
routes.post("/checkRegisterUser", apiController.checkRegisterUser);
routes.post("/signUp", apiController.signUp);
routes.post("/verifyOTP", apiController.verifyOTP);

// Routes For Sign In
routes.post("/signIn", apiController.signIn);
routes.post("/isVerifyAccount", apiController.isVerifyAccount);
routes.post("/resendOtp", apiController.resendOtp);

// Routes For Forgot Password
routes.post("/forgotPassword", apiController.forgotPassword);
routes.post(
  "/forgotPasswordOtpVerification",
  apiController.forgotPasswordOtpVerification
);
routes.post("/resetPassword", apiController.resetPassword);

// Routes For User Details
routes.post(
  "/getUserDetails",
  checkAuthentication,
  apiController.getUserDetails
);
routes.post("/uploadImage", uploadAvatar, apiController.uploadImage);
routes.post(
  "/editUserProfile",
  checkAuthentication,
  apiController.editUserProfile
);
routes.post(
  "/changePassword",
  checkAuthentication,
  apiController.changePassword
);
routes.post(
  "/deleteAccountUser",
  checkAuthentication,
  apiController.deleteAccountUser
);

// Routes For Intro
routes.post("/getAllIntro", apiController.getAllIntro);

// Routes For Banner
routes.post("/getAllBanner", apiController.getAllBanner);

// Routes For Category
routes.post("/getAllCategory", apiController.getAllCategory);

// Routes For Campaign
routes.post("/mostPopulatedCampaign", apiController.mostPopulatedCampaign);
routes.post("/comingToEndCampaign", apiController.comingToEndCampaign);
routes.post("/getAllCampaign", apiController.getAllCampaign);
routes.post("/getAllUpcomingCampaign", apiController.getAllUpcomingCampaign);
routes.post("/getAllEndedCampaign", apiController.getAllEndedCampaign);

// Routes For Add Campaign (user)
routes.post("/addCampaign", checkAuthentication, apiController.addCampaign);

// Routes For Get All User Campaign
routes.post(
  "/getAllUserCampaign",
  checkAuthentication,
  apiController.getAllUserCampaign
);

// Routes For Delete Campaign (user)
routes.post(
  "/deleteCampaign",
  checkAuthentication,
  apiController.deleteCampaign
);

// Routes For Donation
routes.post("/donateAmount", checkAuthentication, apiController.donateAmount);
routes.post(
  "/getAllDonateHistory",
  checkAuthentication,
  apiController.getAllDonateHistory
);

// Routes For Favourite Campaign
routes.post(
  "/addFavouriteCampaign",
  checkAuthentication,
  apiController.addFavouriteCampaign
);
routes.post(
  "/getAllFavouriteCampaign",
  checkAuthentication,
  apiController.getAllFavouriteCampaign
);
routes.post(
  "/deleteFavouriteCampaign",
  checkAuthentication,
  apiController.deleteFavouriteCampaign
);

// Routes For Notification
routes.post(
  "/getAllNotification",
  checkAuthentication,
  apiController.getAllNotification
);

// Routes For Payment Gateway
routes.post(
  "/getAllPaymentGateway",
  checkAuthentication,
  apiController.getAllPaymentGateway
);

// Routes For Currency
routes.post("/getCurrency", apiController.getCurrency);

// Routes For Policy And Conditions
routes.post("/getPage", apiController.getPage);

// Routes For Get OTP
routes.post("/getOtp", apiController.getOtp);

// Routes For Get Forgot Password OTP
routes.post("/getForgotPasswordOtp", apiController.getForgotPasswordOtp);

routes.post("/getAllNews", apiController.getAllNews);
routes.post("/getNewsById", apiController.getNewsById);
routes.post("/getCampaignById", apiController.getCampaignById);

// Paystack payments
routes.post(
  "/payments/paystack/create",
  verifyAccess,
  paymentController.paystackCreate
);
routes.get("/payments/paystack/return", paymentController.paystackReturn);
routes.post(
  "/payments/paystack/verify",
  verifyAccess,
  paymentController.paystackVerify
);
routes.post(
  "/webhooks/paystack",
  // express.raw({ type: "*/*" }),
  paymentController.paystackWebhook
);

module.exports = routes;
