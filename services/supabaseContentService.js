const axios = require("axios");

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase content service requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    timeout: 15000,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

// ---------- helpers ----------
const client = () => getClient();
const optsReturn = { headers: { Prefer: "return=representation" } };

// ---------- counts ----------
async function countTable(path, params = {}) {
  const res = await client().get(path, {
    params: { ...params, select: "id" },
    headers: {
      Range: "0-0",
      Prefer: "count=exact",
    },
  });
  const contentRange = res.headers["content-range"] || res.headers["Content-Range"];
  if (!contentRange) return 0;
  const parts = String(contentRange).split("/");
  const total = parts[1] ? Number(parts[1]) : 0;
  return Number.isFinite(total) ? total : 0;
}

async function countCategories(status = null) {
  const params = {};
  if (status) params.status = `eq.${status}`;
  return countTable("/categories", params);
}

async function countCampaigns(status = null) {
  const params = {};
  if (status) params.campaign_status = `eq.${status}`;
  return countTable("/campaigns", params);
}

async function countUserCampaignsApproved() {
  return countTable("/campaigns", { is_user: "eq.true", is_approved: "eq.true" });
}

async function countBanners(status = null) {
  const params = {};
  if (status) params.status = `eq.${status}`;
  return countTable("/banners", params);
}

async function countUsers() {
  return countTable("/users");
}

async function countActiveUsers() {
  return countTable("/users", { is_active: "eq.true" });
}

async function countDonations() {
  return countTable("/donations");
}

// ---------- categories ----------
async function listCategories() {
  const res = await client().get("/categories", { params: { select: "*", order: "created_at.desc" } });
  return res.data || [];
}
async function getCategory(id) {
  const res = await client().get("/categories", { params: { select: "*", id: `eq.${id}`, limit: 1 } });
  return res.data?.[0] || null;
}
async function createCategory(payload) {
  const res = await client().post("/categories", payload, optsReturn);
  return res.data?.[0] || null;
}
async function updateCategory(id, payload) {
  const res = await client().patch("/categories", payload, {
    ...optsReturn,
    params: { id: `eq.${id}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}
async function deleteCategory(id) {
  await client().delete("/categories", { params: { id: `eq.${id}` } });
}

// ---------- banners ----------
async function listBanners(options = {}) {
  const params = { select: options.includeNews ? "*,news:news_id(*)" : "*", order: "created_at.desc" };
  const res = await client().get("/banners", { params });
  return res.data || [];
}
async function createBanner(payload) {
  const res = await client().post("/banners", payload, optsReturn);
  return res.data?.[0] || null;
}
async function updateBanner(id, payload) {
  const res = await client().patch("/banners", payload, {
    ...optsReturn,
    params: { id: `eq.${id}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}
async function deleteBanner(id) {
  await client().delete("/banners", { params: { id: `eq.${id}` } });
}

// ---------- news ----------
async function listNews() {
  const res = await client().get("/news", { params: { select: "*", order: "created_at.desc" } });
  return res.data || [];
}
async function getNews(id) {
  const res = await client().get("/news", { params: { select: "*", id: `eq.${id}`, limit: 1 } });
  return res.data?.[0] || null;
}
async function createNews(payload) {
  const res = await client().post("/news", payload, optsReturn);
  return res.data?.[0] || null;
}
async function updateNews(id, payload) {
  const res = await client().patch("/news", payload, {
    ...optsReturn,
    params: { id: `eq.${id}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}
async function deleteNews(id) {
  await client().delete("/news", { params: { id: `eq.${id}` } });
}
async function deleteBannersByNewsId(newsId) {
  await client().delete("/banners", { params: { news_id: `eq.${newsId}` } });
}

// ---------- campaigns ----------
async function listCampaigns({ status, categoryId, limit, filter = {} } = {}) {
  const params = { select: "*", order: "created_at.desc" };
  if (status) params.campaign_status = `eq.${status}`;
  if (categoryId) params.category_id = `eq.${categoryId}`;
  if (filter.is_user !== undefined) params.is_user = `eq.${filter.is_user}`;
  if (filter.is_approved !== undefined) params.is_approved = `eq.${filter.is_approved}`;
  if (limit) params.limit = limit;
  const res = await client().get("/campaigns", { params });
  return res.data || [];
}
async function getCampaign(id) {
  const res = await client().get("/campaigns", { params: { select: "*", id: `eq.${id}`, limit: 1 } });
  return res.data?.[0] || null;
}
async function createCampaign(payload) {
  const res = await client().post("/campaigns", payload, optsReturn);
  return res.data?.[0] || null;
}
async function updateCampaign(id, payload) {
  const res = await client().patch("/campaigns", payload, {
    ...optsReturn,
    params: { id: `eq.${id}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}
async function deleteCampaign(id) {
  await client().delete("/campaigns", { params: { id: `eq.${id}` } });
}
async function deleteCampaignsByCategory(categoryId) {
  await client().delete("/campaigns", { params: { category_id: `eq.${categoryId}` } });
}

// ---------- donations ----------
async function listDonations(limit = 20) {
  const res = await client().get("/donations", {
    params: { select: "*", order: "created_at.desc", limit },
  });
  return res.data || [];
}
async function listDonationsByUser(userId, limit = 50) {
  if (!userId) return [];
  const res = await client().get("/donations", {
    params: {
      select: "*",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit,
    },
  });
  return res.data || [];
}
async function deleteDonationsByCampaignIds(ids = []) {
  if (!ids.length) return;
  await client().delete("/donations", {
    params: { campaign_id: `in.(${ids.map((id) => `"${id}"`).join(",")})` },
  });
}
async function insertDonation(payload) {
  const res = await client().post("/donations", payload, optsReturn);
  return res.data?.[0] || null;
}
async function updateDonationByReference(reference, updates) {
  const res = await client().patch("/donations", updates, {
    ...optsReturn,
    params: { transaction_id: `eq.${reference}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}
async function getDonationByReference(reference) {
  const res = await client().get("/donations", {
    params: { select: "*", transaction_id: `eq.${reference}`, limit: 1 },
  });
  return res.data?.[0] || null;
}

// ---------- pages (singleton) ----------
async function getPagesSingleton() {
  const res = await client().get("/pages", { params: { select: "*", limit: 1 } });
  return res.data?.[0] || null;
}
async function upsertPages(payload) {
  const existing = await getPagesSingleton();
  if (existing?.id) {
    const res = await client().patch("/pages", payload, {
      ...optsReturn,
      params: { id: `eq.${existing.id}`, select: "*", limit: 1 },
    });
    return res.data?.[0] || null;
  }
  const res = await client().post("/pages", { ...payload, singleton: true }, optsReturn);
  return res.data?.[0] || null;
}

// ---------- payment gateways ----------
async function getPaymentGateway(provider = "paystack") {
  const res = await client().get("/payment_gateways", {
    params: { select: "*", provider: `eq.${provider}`, limit: 1 },
  });
  return res.data?.[0] || null;
}
async function upsertPaymentGateway(payload) {
  const existing = await getPaymentGateway(payload.provider || "paystack");
  if (existing?.id) {
    const res = await client().patch("/payment_gateways", payload, {
      ...optsReturn,
      params: { id: `eq.${existing.id}`, select: "*", limit: 1 },
    });
    return res.data?.[0] || null;
  }
  const res = await client().post("/payment_gateways", payload, optsReturn);
  return res.data?.[0] || null;
}

// ---------- notifications ----------
async function listNotifications() {
  const res = await client().get("/notifications", {
    params: { select: "*", order: "created_at.desc" },
  });
  // Normalize field names for downstream consumers (web UI, mobile API)
  return (res.data || []).map((row) => ({
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    is_read: typeof row.is_read === "boolean" ? row.is_read : false,
  }));
}
async function createNotification(payload) {
  const res = await client().post("/notifications", payload, optsReturn);
  return res.data?.[0] || null;
}

// ---------- favourites ----------
async function listFavouritesByUser(userId) {
  const res = await client().get("/favourite_campaigns", {
    params: { select: "*", user_id: `eq.${userId}` },
  });
  return res.data || [];
}
async function addFavouriteCampaign({ userId, campaignId }) {
  if (!userId || !campaignId) return null;
  const res = await client().post(
    "/favourite_campaigns",
    {
      user_id: userId,
      campaign_id: campaignId,
    },
    {
      headers: {
        ...optsReturn.headers,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      params: {
        on_conflict: "user_id,campaign_id",
        select: "*",
      },
    }
  );
  return res.data?.[0] || null;
}
async function deleteFavouriteCampaign({ userId, campaignId }) {
  if (!userId || !campaignId) return;
  await client().delete("/favourite_campaigns", {
    params: {
      user_id: `eq.${userId}`,
      campaign_id: `eq.${campaignId}`,
    },
  });
}

// ---------- devices ----------
async function listUserDevices(userId = null) {
  const params = { select: "*" };
  if (userId) params.user_id = `eq.${userId}`;
  const res = await client().get("/user_notification_devices", { params });
  return res.data || [];
}

async function upsertUserDevice({ userId, deviceId, registrationToken, platform = "unknown" }) {
  const payload = {
    user_id: userId,
    device_id: deviceId,
    registration_token: registrationToken,
    platform,
  };
  const res = await client().post("/user_notification_devices", payload, {
    headers: {
      ...optsReturn.headers,
      Prefer: "resolution=merge-duplicates",
    },
    params: {
      on_conflict: "user_id,device_id",
      select: "*",
    },
  });
  return res.data?.[0] || null;
}

async function deleteUserDevicesByTokens(tokens = []) {
  if (!tokens.length) return;
  await client().delete("/user_notification_devices", {
    params: { registration_token: `in.(${tokens.map((t) => `"${t}"`).join(",")})` },
  });
}

async function listUserDevicesByUserIds(userIds = []) {
  if (!userIds.length) return [];
  const inList = userIds.map((id) => `"${id}"`).join(",");
  const res = await client().get("/user_notification_devices", {
    params: { select: "*", user_id: `in.(${inList})` },
  });
  return res.data || [];
}

// ---------- followers / donors (audiences) ----------
async function listFollowersByCampaign(campaignId) {
  if (!campaignId) return [];
  const res = await client().get("/favourite_campaigns", {
    params: {
      select: "user_id",
      campaign_id: `eq.${campaignId}`,
    },
  });
  return (res.data || []).map((r) => r.user_id).filter(Boolean);
}

async function listDonorsByCampaign(campaignId) {
  if (!campaignId) return [];
  const res = await client().get("/donations", {
    params: {
      select: "user_id",
      campaign_id: `eq.${campaignId}`,
    },
  });
  return (res.data || []).map((r) => r.user_id).filter(Boolean);
}

// ---------- push rules ----------
async function listPushRules() {
  const res = await client().get("/push_rules", {
    params: { select: "*", order: "updated_at.desc" },
  });
  return res.data || [];
}

async function createPushRule(payload) {
  const res = await client().post("/push_rules", payload, optsReturn);
  return res.data?.[0] || null;
}

async function updatePushRule(id, payload) {
  const res = await client().patch("/push_rules", payload, {
    ...optsReturn,
    params: { id: `eq.${id}`, select: "*", limit: 1 },
  });
  return res.data?.[0] || null;
}

async function deletePushRule(id) {
  await client().delete("/push_rules", { params: { id: `eq.${id}` } });
}

async function getLatestPushRuleVersion() {
  const res = await client().get("/push_rule_versions", {
    params: { select: "*", order: "version.desc", limit: 1 },
  });
  return res.data?.[0] || null;
}

async function createPushRuleVersion(payload) {
  const res = await client().post("/push_rule_versions", payload, optsReturn);
  return res.data?.[0] || null;
}

async function getPublicPushConfig() {
  const res = await client().get("/public_push_config", {
    params: { select: "*" },
  });
  return res.data?.[0] || null;
}

// ---------- users ----------
async function listRecentUsers(limit = 10) {
  const res = await client().get("/users", {
    params: { select: "*", order: "created_at.desc", limit },
  });
  return res.data || [];
}

// ---------- campaign stats view ----------
async function getCampaignDonationStatsForIds(ids = []) {
  if (!ids.length) return [];
  const inList = ids.map((id) => `"${id}"`).join(",");
  const res = await client().get("/campaign_donation_stats", {
    params: {
      select: "*",
      campaign_id: `in.(${inList})`,
    },
  });
  return res.data || [];
}

module.exports = {
  countCategories,
  countCampaigns,
  countUserCampaignsApproved,
  countBanners,
  countUsers,
  countActiveUsers,
  countDonations,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  deleteBannersByNewsId,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  deleteCampaignsByCategory,
  getPagesSingleton,
  upsertPages,
  getPaymentGateway,
  upsertPaymentGateway,
  listDonations,
  listDonationsByUser,
  insertDonation,
  updateDonationByReference,
  getDonationByReference,
  listNotifications,
  createNotification,
  listFavouritesByUser,
  addFavouriteCampaign,
  deleteFavouriteCampaign,
  listUserDevices,
  listUserDevicesByUserIds,
  deleteUserDevicesByTokens,
  listFollowersByCampaign,
  listDonorsByCampaign,
  listPushRules,
  createPushRule,
  updatePushRule,
  deletePushRule,
  getLatestPushRuleVersion,
  createPushRuleVersion,
  getPublicPushConfig,
  listRecentUsers,
  getCampaignDonationStatsForIds,
};
