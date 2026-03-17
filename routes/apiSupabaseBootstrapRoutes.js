const express = require("express");
const paymentController = require("../controllers/paymentController");
const { getSupabaseEnvStatus } = require("../config/supabaseEnv");
const supabaseAuthController = require("../controllers/supabaseAuthController");
const { uploadAvatar } = require("../middleware/upload.single.stream");
const { createApiRateLimitMiddleware } = require("../services/authSecurityService");
const { requireRole } = require("../middleware/requireRole");

const routes = express.Router();

const signUpRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:signup",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many sign-up attempts. Try again in {retryAfterSec} seconds.",
});

const signInRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:signin",
  limit: 20,
  windowMs: 15 * 60 * 1000,
  message: "Too many sign-in attempts. Try again in {retryAfterSec} seconds.",
});

const forgotRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:forgot",
  limit: 8,
  windowMs: 15 * 60 * 1000,
  message:
    "Too many password reset attempts. Try again in {retryAfterSec} seconds.",
});

const resetRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:reset",
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message:
    "Too many password reset submissions. Try again in {retryAfterSec} seconds.",
});

const resendRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:resend",
  limit: 8,
  windowMs: 15 * 60 * 1000,
  message: "Too many resend attempts. Try again in {retryAfterSec} seconds.",
});

const verifyCheckRateLimit = createApiRateLimitMiddleware({
  bucket: "auth:verify-check",
  limit: 40,
  windowMs: 15 * 60 * 1000,
  message:
    "Too many verification checks. Try again in {retryAfterSec} seconds.",
});

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
routes.post("/signUp", signUpRateLimit, supabaseAuthController.signUp);
routes.post("/signIn", signInRateLimit, supabaseAuthController.signIn);
routes.post("/isVerifyAccount", supabaseAuthController.isVerifyAccount);
routes.post("/forgotPassword", forgotRateLimit, supabaseAuthController.forgotPassword);
routes.post("/ForgotPassword", forgotRateLimit, supabaseAuthController.forgotPassword);
routes.post(
  "/forgotPasswordOtpVerification",
  supabaseAuthController.forgotPasswordOtpVerification
);
routes.post("/resetPassword", resetRateLimit, supabaseAuthController.resetPassword);
routes.post("/uploadImage", uploadAvatar, supabaseAuthController.uploadImage);
routes.post(
  "/editUserProfile",
  requireRole(["user"]),
  supabaseAuthController.editUserProfile
);
routes.post(
  "/changePassword",
  requireRole(["user"]),
  supabaseAuthController.changePassword
);
routes.post(
  "/deleteAccountUser",
  requireRole(["user"]),
  supabaseAuthController.deleteAccountUser
);
routes.post(
  "/getUserDetails",
  requireRole(["user"]),
  supabaseAuthController.getUserDetails
);
routes.post("/getCurrency", supabaseAuthController.getCurrency);

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
