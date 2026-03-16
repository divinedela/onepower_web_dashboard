const express = require("express");
const paymentController = require("../controllers/paymentController");
const { getSupabaseEnvStatus } = require("../config/supabaseEnv");
const supabaseAuthController = require("../controllers/supabaseAuthController");
const { uploadAvatar } = require("../middleware/upload.single.stream");

const routes = express.Router();

routes.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    mode: "supabase-bootstrap",
    ts: new Date().toISOString(),
  });
});

routes.get("/migration/status", (_req, res) => {
  const supabaseEnv = getSupabaseEnvStatus();
  res.status(200).json({
    ok: true,
    provider: {
      auth: process.env.AUTH_PROVIDER || "mongodb",
      data: process.env.DATA_PROVIDER || "mongodb",
      storage: process.env.STORAGE_PROVIDER || "local",
      push: process.env.PUSH_PROVIDER || "firebase",
      payments: "paystack",
    },
    supabaseEnv,
    message:
      "Mongo-backed API routes are intentionally disabled while Supabase migration is in progress.",
  });
});

// Mobile auth/account endpoints migrated for Supabase mode.
routes.post("/checkRegisterUser", supabaseAuthController.checkRegisterUser);
routes.post("/signUp", supabaseAuthController.signUp);
routes.post("/verifyOTP", supabaseAuthController.verifyOTP);
routes.post("/signIn", supabaseAuthController.signIn);
routes.post("/isVerifyAccount", supabaseAuthController.isVerifyAccount);
routes.post("/resendOtp", supabaseAuthController.resendOtp);
routes.post("/forgotPassword", supabaseAuthController.forgotPassword);
routes.post("/ForgotPassword", supabaseAuthController.forgotPassword);
routes.post(
  "/forgotPasswordOtpVerification",
  supabaseAuthController.forgotPasswordOtpVerification
);
routes.post("/resetPassword", supabaseAuthController.resetPassword);
routes.post("/uploadImage", uploadAvatar, supabaseAuthController.uploadImage);
routes.post("/editUserProfile", supabaseAuthController.editUserProfile);
routes.post("/changePassword", supabaseAuthController.changePassword);
routes.post("/deleteAccountUser", supabaseAuthController.deleteAccountUser);
routes.post("/getUserDetails", supabaseAuthController.getUserDetails);

// Keep paystack return/deeplink callback available in bootstrap mode.
routes.get("/payments/paystack/return", paymentController.paystackReturn);

routes.all("*", (_req, res) => {
  res.status(503).json({
    ok: false,
    code: "SUPABASE_MIGRATION_IN_PROGRESS",
    message:
      "This endpoint is not available in Supabase bootstrap mode yet. Migrate this API to Supabase and re-enable it.",
  });
});

module.exports = routes;
