const {
  listIntros,
} = require("../services/supabaseIntroService");
const {
  listBanners,
  listCategories,
  listNews,
  getNews,
  listCampaigns,
  getCampaign,
  createCampaign,
  deleteCampaign,
  getPaymentGateway,
  listNotifications,
  listDonationsByUser,
  insertDonation,
  listFavouritesByUser,
  addFavouriteCampaign,
  deleteFavouriteCampaign,
  getPagesSingleton,
  getCampaignDonationStatsForIds,
} = require("../services/supabaseContentService");
const { getAuthUserByAccessToken } = require("../services/supabaseAuthProviderService");
const { findUserByAuthUserId } = require("../services/supabaseUserAuthService");

const responseData = ({ success, message, error = 0, extra = {} }) => ({
  data: { success, message, error, ...extra },
});

const parseBearer = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim();
};

async function resolveUser(req) {
  const token = parseBearer(req);
  if (!token) return null;
  const authUser = await getAuthUserByAccessToken(token);
  if (!authUser?.id) return null;
  const profile = await findUserByAuthUserId(authUser.id);
  return profile || null;
}

// ---------- Content endpoints ----------
const getAllIntro = async (_req, res) => {
  try {
    const intros = await listIntros();
    const published = (intros || []).filter(
      (i) => (i.status || "").toLowerCase() === "publish"
    );
    if (!published.length) {
      return res.json(
        responseData({
          success: 2,
          message: "No intro available",
          extra: { intro: [] },
        })
      );
    }
    return res.json(
      responseData({
        success: 1,
        message: "Intro loaded",
        extra: { intro: published },
      })
    );
  } catch (e) {
    console.error("getAllIntro error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to load intro",
        error: 1,
      })
    );
  }
};

const getAllBanner = async (_req, res) => {
  try {
    const banner = await listBanners();
    return res.json(
      responseData({
        success: 1,
        message: "Banner loaded",
        extra: { banner },
      })
    );
  } catch (e) {
    console.error("getAllBanner error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load banner", error: 1 })
    );
  }
};

const getAllNews = async (_req, res) => {
  try {
    const news = await listNews();
    return res.json(
      responseData({
        success: 1,
        message: "News loaded",
        extra: { news },
      })
    );
  } catch (e) {
    console.error("getAllNews error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load news", error: 1 })
    );
  }
};

const getNewsById = async (req, res) => {
  try {
    const id = req.body?.newsId;
    if (!id) {
      return res.json(
        responseData({ success: 0, message: "newsId is required", error: 1 })
      );
    }
    const news = await getNews(id);
    if (!news) {
      return res.json(
        responseData({ success: 0, message: "News not found", error: 1 })
      );
    }
    return res.json(
      responseData({ success: 1, message: "News loaded", extra: { news } })
    );
  } catch (e) {
    console.error("getNewsById error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load news", error: 1 })
    );
  }
};

const getAllCategory = async (_req, res) => {
  try {
    const category = await listCategories();
    return res.json(
      responseData({
        success: 1,
        message: "Categories loaded",
        extra: { category },
      })
    );
  } catch (e) {
    console.error("getAllCategory error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load categories", error: 1 })
    );
  }
};

const getAllCampaign = async (req, res) => {
  try {
    const { categoryId, campaignId } = req.body || {};
    const filter = {};
    let campaigns = [];
    if (campaignId) {
      const single = await getCampaign(campaignId);
      campaigns = single ? [single] : [];
    } else {
      campaigns = await listCampaigns({
        categoryId,
        filter: { is_approved: true },
      });
    }
    return res.json(
      responseData({
        success: 1,
        message: "Campaigns loaded",
        extra: { campaigns },
      })
    );
  } catch (e) {
    console.error("getAllCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const getCampaignById = async (req, res) => {
  try {
    const { campaignId } = req.body || {};
    if (!campaignId) {
      return res.json(
        responseData({ success: 0, message: "campaignId is required", error: 1 })
      );
    }
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      return res.json(
        responseData({ success: 0, message: "Campaign not found", error: 1 })
      );
    }
    return res.json(
      responseData({
        success: 1,
        message: "Campaign loaded",
        extra: { campaign },
      })
    );
  } catch (e) {
    console.error("getCampaignById error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaign", error: 1 })
    );
  }
};

const mostPopulatedCampaign = async (_req, res) => {
  try {
    const campaigns = await listCampaigns({ filter: { is_approved: true } });
    const ids = campaigns.map((c) => c.id).filter(Boolean);
    const stats = ids.length ? await getCampaignDonationStatsForIds(ids) : [];
    const totals = new Map();
    stats.forEach((s) => totals.set(s.campaign_id, Number(s.total_amount) || 0));
    const sorted = campaigns.sort(
      (a, b) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0)
    );
    return res.json(
      responseData({
        success: 1,
        message: "Campaigns loaded",
        extra: { campaigns: sorted },
      })
    );
  } catch (e) {
    console.error("mostPopulatedCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const comingToEndCampaign = async (_req, res) => {
  try {
    const campaigns = await listCampaigns({ filter: { is_approved: true } });
    const sorted = campaigns
      .filter((c) => c.ending_date)
      .sort(
        (a, b) =>
          new Date(a.ending_date).getTime() - new Date(b.ending_date).getTime()
      );
    return res.json(
      responseData({
        success: 1,
        message: "Campaigns loaded",
        extra: { campaigns: sorted },
      })
    );
  } catch (e) {
    console.error("comingToEndCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const getAllEndedCampaign = async (_req, res) => {
  try {
    const campaigns = await listCampaigns({
      status: "Ended",
      filter: { is_approved: true },
    });
    return res.json(
      responseData({
        success: 1,
        message: "Ended campaigns loaded",
        extra: { campaigns },
      })
    );
  } catch (e) {
    console.error("getAllEndedCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const getAllUpcomingCampaign = async (_req, res) => {
  try {
    const campaigns = await listCampaigns({
      status: "Upcoming",
      filter: { is_approved: true },
    });
    return res.json(
      responseData({
        success: 1,
        message: "Upcoming campaigns loaded",
        extra: { campaigns },
      })
    );
  } catch (e) {
    console.error("getAllUpcomingCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const getAllNotification = async (_req, res) => {
  try {
    const notification = await listNotifications();
    return res.json(
      responseData({
        success: 1,
        message: "Notifications loaded",
        extra: { notification },
      })
    );
  } catch (e) {
    console.error("getAllNotification error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to load notifications",
        error: 1,
      })
    );
  }
};

const getAllPaymentGateway = async (_req, res) => {
  try {
    const paymentGateway = await getPaymentGateway("paystack");
    return res.json(
      responseData({
        success: 1,
        message: "Payment gateways loaded",
        extra: { paymentGateway },
      })
    );
  } catch (e) {
    console.error("getAllPaymentGateway error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to load payment gateways",
        error: 1,
      })
    );
  }
};

const getPage = async (_req, res) => {
  try {
    const pages = await getPagesSingleton();
    return res.json(
      responseData({ success: 1, message: "Pages loaded", extra: { pages } })
    );
  } catch (e) {
    console.error("getPage error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load pages", error: 1 })
    );
  }
};

// ---------- User-scoped ----------
const getAllUserCampaign = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const campaigns = await listCampaigns({
      filter: { is_user: true, is_approved: true },
    });
    const mine = campaigns.filter((c) => String(c.user_id) === String(user.id));
    return res.json(
      responseData({
        success: 1,
        message: "User campaigns loaded",
        extra: { campaigns: mine },
      })
    );
  } catch (e) {
    console.error("getAllUserCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to load campaigns", error: 1 })
    );
  }
};

const addCampaign = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const payload = req.body || {};
    const campaignPayload = {
      image: payload.image || "",
      name: payload.name || "",
      category_id: payload.categoryId || null,
      campaign_amount: payload.campaign_amount || payload.campaignAmount || 0,
      starting_date: payload.starting_date || payload.startingDate || null,
      ending_date: payload.ending_date || payload.endingDate || null,
      organizer_image: payload.organizer_image || payload.organizerImage || "",
      organizer_name: payload.organizer_name || payload.organizerName || "",
      gallery: payload.gallery || [],
      description: payload.description || "",
      campaign_status: "Pending",
      is_user: true,
      is_approved: true,
      user_id: user.id,
    };
    const created = await createCampaign(campaignPayload);
    return res.json(
      responseData({
        success: 1,
        message: "Campaign submitted",
        extra: { campaign: created },
      })
    );
  } catch (e) {
    console.error("addCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to add campaign", error: 1 })
    );
  }
};

const deleteCampaignHandler = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const { campaignId } = req.body || {};
    if (!campaignId) {
      return res.json(
        responseData({ success: 0, message: "campaignId is required", error: 1 })
      );
    }
    await deleteCampaign(campaignId);
    return res.json(
      responseData({ success: 1, message: "Campaign deleted", extra: {} })
    );
  } catch (e) {
    console.error("deleteCampaign error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to delete campaign", error: 1 })
    );
  }
};

const donateAmount = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const { campaignId, amount, payment_method, payment_status, transaction_id } =
      req.body || {};
    if (!campaignId || !amount) {
      return res.json(
        responseData({ success: 0, message: "campaignId and amount are required", error: 1 })
      );
    }
    await insertDonation({
      user_id: user.id,
      campaign_id: campaignId,
      amount: Number(amount),
      payment_method: payment_method || "manual",
      payment_status: payment_status || "Pending",
      transaction_id: transaction_id || `TX_${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
    });
    return res.json(
      responseData({ success: 1, message: "Donation recorded", extra: {} })
    );
  } catch (e) {
    console.error("donateAmount error", e?.message || e);
    return res.json(
      responseData({ success: 0, message: "Unable to donate", error: 1 })
    );
  }
};

const getAllDonateHistory = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const donations = await listDonationsByUser(user.id, 100);
    return res.json(
      responseData({
        success: 1,
        message: "Donations loaded",
        extra: { donateHistory: donations },
      })
    );
  } catch (e) {
    console.error("getAllDonateHistory error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to load donations",
        error: 1,
      })
    );
  }
};

const addFavouriteCampaignHandler = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const { campaignId } = req.body || {};
    if (!campaignId) {
      return res.json(
        responseData({ success: 0, message: "campaignId is required", error: 1 })
      );
    }
    await addFavouriteCampaign({ userId: user.id, campaignId });
    return res.json(
      responseData({ success: 1, message: "Favourite added", extra: {} })
    );
  } catch (e) {
    console.error("addFavouriteCampaign error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to add favourite",
        error: 1,
      })
    );
  }
};

const getAllFavouriteCampaign = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const favourites = await listFavouritesByUser(user.id);
    return res.json(
      responseData({
        success: 1,
        message: "Favourites loaded",
        extra: { campaigns: favourites },
      })
    );
  } catch (e) {
    console.error("getAllFavouriteCampaign error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to load favourites",
        error: 1,
      })
    );
  }
};

const deleteFavouriteCampaignHandler = async (req, res) => {
  try {
    const user = await resolveUser(req);
    if (!user?.id) {
      return res.status(401).json(
        responseData({ success: 0, message: "Unauthorized", error: 1 })
      );
    }
    const { campaignId } = req.body || {};
    if (!campaignId) {
      return res.json(
        responseData({ success: 0, message: "campaignId is required", error: 1 })
      );
    }
    await deleteFavouriteCampaign({ userId: user.id, campaignId });
    return res.json(
      responseData({ success: 1, message: "Favourite removed", extra: {} })
    );
  } catch (e) {
    console.error("deleteFavouriteCampaign error", e?.message || e);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to remove favourite",
        error: 1,
      })
    );
  }
};

module.exports = {
  getAllIntro,
  getAllBanner,
  getAllNews,
  getNewsById,
  getAllCategory,
  getAllCampaign,
  getAllEndedCampaign,
  getAllUpcomingCampaign,
  getCampaignById,
  mostPopulatedCampaign,
  comingToEndCampaign,
  getAllNotification,
  getAllPaymentGateway,
  getPage,
  getAllUserCampaign,
  addCampaign,
  deleteCampaign: deleteCampaignHandler,
  donateAmount,
  getAllDonateHistory,
  addFavouriteCampaign: addFavouriteCampaignHandler,
  getAllFavouriteCampaign,
  deleteFavouriteCampaign: deleteFavouriteCampaignHandler,
};
