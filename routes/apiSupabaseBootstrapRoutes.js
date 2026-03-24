const express = require("express");
const paymentController = require("../controllers/paymentController");
const { getSupabaseEnvStatus } = require("../config/supabaseEnv");
const supabaseAuthController = require("../controllers/supabaseAuthController");
const supabaseContentApiController = require("../controllers/supabaseContentApiController");
const { uploadAvatar } = require("../middleware/upload.single.stream");
const { createApiRateLimitMiddleware } = require("../services/authSecurityService");
const { requireRole } = require("../middleware/requireRole");
const { getAuthUserByAccessToken } = require("../services/supabaseAuthProviderService");
const { findUserByAuthUserId } = require("../services/supabaseUserAuthService");
const { upsertUserDevice } = require("../services/supabaseContentService");
const { getLatestConfig } = require("../services/pushConfigService");

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

async function attachSupabaseUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) {
      return res
        .status(401)
        .json({ data: { success: 0, message: "Unauthorized", error: 1 } });
    }
    const authUser = await getAuthUserByAccessToken(token);
    if (!authUser?.id) {
      return res
        .status(401)
        .json({ data: { success: 0, message: "Unauthorized", error: 1 } });
    }
    const profile = await findUserByAuthUserId(authUser.id);
    if (!profile?.id) {
      return res
        .status(401)
        .json({ data: { success: 0, message: "Unauthorized", error: 1 } });
    }
    req.user = profile;
    req.authRole = "user";
    return next();
  } catch (error) {
    console.error("attachSupabaseUser error", error?.message || error);
    return res
      .status(401)
      .json({ data: { success: 0, message: "Unauthorized", error: 1 } });
  }
}

routes.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    mode: "supabase-bootstrap",
    ts: new Date().toISOString(),
  });
});

// Public push config for mobile clients (server-driven push rules)
routes.get("/push-config", async (req, res) => {
  try {
    const cfg = await getLatestConfig();
    const etag = cfg.etag || `"${cfg.version || 0}"`;
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json({
      ok: true,
      version: cfg.version || 0,
      updated_at: cfg.published_at || null,
      enabled: cfg.enabled !== false,
      min_app_version: cfg.min_app_version || null,
      rules: cfg.rules || [],
    });
  } catch (error) {
    console.error("push-config error", error);
    return res.status(500).json({ ok: false, error: "Failed to load config" });
  }
});

// Register / refresh device token for push notifications (Supabase auth bearer)
routes.post("/register-device", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    const { deviceId = "", registrationToken = "", platform = "unknown" } =
      req.body || {};

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing bearer token" });
    }
    if (!deviceId || !registrationToken) {
      return res
        .status(400)
        .json({ ok: false, error: "deviceId and registrationToken are required" });
    }

    const authUser = await getAuthUserByAccessToken(token);
    const userId = authUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Invalid access token" });
    }

    const saved = await upsertUserDevice({
      userId,
      deviceId,
      registrationToken,
      platform,
    });

    return res.status(200).json({ ok: true, device: saved });
  } catch (error) {
    console.error("register-device error", error);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to register device" });
  }
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
routes.post("/getAllIntro", supabaseContentApiController.getAllIntro);
routes.post("/getAllBanner", supabaseContentApiController.getAllBanner);
routes.post("/getAllNews", supabaseContentApiController.getAllNews);
routes.post("/getNewsById", supabaseContentApiController.getNewsById);
routes.post("/getAllCategory", supabaseContentApiController.getAllCategory);
routes.post("/getAllCampaign", supabaseContentApiController.getAllCampaign);
routes.post("/getAllEndedCampaign", supabaseContentApiController.getAllEndedCampaign);
routes.post("/getAllUpcomingCampaign", supabaseContentApiController.getAllUpcomingCampaign);
routes.post("/getCampaignById", supabaseContentApiController.getCampaignById);
routes.post("/mostPopulatedCampaign", supabaseContentApiController.mostPopulatedCampaign);
routes.post("/comingToEndCampaign", supabaseContentApiController.comingToEndCampaign);
routes.post("/getAllNotification", supabaseContentApiController.getAllNotification);
routes.post("/getAllPaymentGateway", supabaseContentApiController.getAllPaymentGateway);
routes.post("/getPage", supabaseContentApiController.getPage);
routes.post("/getAllUserCampaign", supabaseContentApiController.getAllUserCampaign);
routes.post("/addCampaign", supabaseContentApiController.addCampaign);
routes.post("/deleteCampaign", supabaseContentApiController.deleteCampaign);
routes.post("/donateAmount", supabaseContentApiController.donateAmount);
routes.post("/getAllDonateHistory", supabaseContentApiController.getAllDonateHistory);
routes.post("/addFavouriteCampaign", supabaseContentApiController.addFavouriteCampaign);
routes.post("/getAllFavouriteCampaign", supabaseContentApiController.getAllFavouriteCampaign);
routes.post(
  "/deleteFavouriteCampaign",
  supabaseContentApiController.deleteFavouriteCampaign
);
routes.post(
  "/paystackCreateTx",
  attachSupabaseUser,
  paymentController.paystackCreate
);
routes.post(
  "/paystackVerify",
  attachSupabaseUser,
  paymentController.paystackVerify
);
// Back-compat endpoints expected by the mobile app
routes.post(
  "/payments/paystack/create",
  attachSupabaseUser,
  paymentController.paystackCreate
);
routes.post(
  "/payments/paystack/verify",
  attachSupabaseUser,
  paymentController.paystackVerify
);

// Keep paystack return/deeplink callback available in bootstrap mode.
routes.get("/payments/paystack/return", paymentController.paystackReturn);

// Paystack webhook (signature verified in paymentController)
routes.post("/webhooks/paystack", paymentController.paystackWebhook);

routes.all("*", (_req, res) => {
  res.status(503).json({
    ok: false,
    code: "SUPABASE_MIGRATION_IN_PROGRESS",
    message:
      "This endpoint is not available in Supabase bootstrap mode yet. Migrate this API to Supabase and re-enable it.",
  });
});

module.exports = routes;
