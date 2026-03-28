const {
  listIntros,
} = require("../services/supabaseIntroService");
const {
  listBanners,
  listCategories,
  listNews,
  getNews,
  listCampaigns,
  listCampaignsByIds,
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

// ---------- campaign helpers ----------
function deriveCampaignLifecycle(campaign) {
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10)); // midnight today

  const startRaw = campaign.starting_date;
  const endRaw = campaign.ending_date;

  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;

  const startValid = !!start && isFinite(start.getTime());
  const endValid = !!end && isFinite(end.getTime());
  const endInclusive =
    endValid ? new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999) : null;

  let campaignStatus = "Upcoming";
  let remainingTime = "Time not available";

  if (endValid && now > endInclusive) {
    campaignStatus = "Ended";
    remainingTime = "Campaign ended";
    return { campaignStatus, remainingTime };
  }

  if (startValid && now < start) {
    campaignStatus = "Upcoming";
    const diffMs = start.getTime() - today.getTime();
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    remainingTime = days === 0 ? "Starting soon" : `Upcoming in ${days} day${days === 1 ? "" : "s"}`;
    return { campaignStatus, remainingTime };
  }

  // Running branch (has started and not ended)
  campaignStatus = "Running";
  if (endValid) {
    const diffMs = endInclusive.getTime() - now.getTime();
    const hours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
    if (hours < 24) {
      remainingTime = `${hours} hour${hours === 1 ? "" : "s"} left`;
    } else {
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      remainingTime = `${days} day${days === 1 ? "" : "s"} left`;
    }
  } else {
    remainingTime = "Time not available";
  }

  return { campaignStatus, remainingTime };
}

async function hydrateCampaigns(campaigns = []) {
  const list = Array.isArray(campaigns) ? campaigns : [campaigns];
  if (!list.length) return Array.isArray(campaigns) ? [] : null;

  const ids = list.map((c) => c.id).filter(Boolean);
  const stats = ids.length ? await getCampaignDonationStatsForIds(ids) : [];
  const statMap = new Map(stats.map((s) => [String(s.campaign_id), s]));

  const enriched = list.map((c) => {
    const stat = statMap.get(String(c.id));
    const totalDonationAmount = Number(stat?.total_donation_amount ?? 0);
    const totalDonors = Number(stat?.total_donors ?? 0);
    const remainingAmount =
      stat?.remaining_amount !== undefined
        ? Number(stat.remaining_amount)
        : Math.max(0, Number(c.campaign_amount || 0) - totalDonationAmount);

    const gallery = Array.isArray(c.gallery) ? [...c.gallery] : [];
    const mergedGallery =
      c.image && !gallery.includes(c.image) ? [c.image, ...gallery] : gallery;

    const { campaignStatus, remainingTime } = deriveCampaignLifecycle(c);

    return {
      ...c,
      _id: c.id, // alias for legacy clients expecting Mongo-style key
      gallery: mergedGallery,
      totalDonationAmount,
      totalDonors,
      remainingAmount,
      remainingTime,
      campaign_status: campaignStatus,
    };
  });

  return Array.isArray(campaigns) ? enriched : enriched[0];
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
    campaigns = await hydrateCampaigns(campaigns);
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
    const hydrated = await hydrateCampaigns(campaign);
    return res.json(
      responseData({
        success: 1,
        message: "Campaign loaded",
        extra: { campaign: hydrated },
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
    const campaigns = await hydrateCampaigns(
      await listCampaigns({ filter: { is_approved: true } })
    );
    const sorted = campaigns.sort(
      (a, b) => (Number(b.totalDonationAmount) || 0) - (Number(a.totalDonationAmount) || 0)
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
    const campaigns = await hydrateCampaigns(
      await listCampaigns({ filter: { is_approved: true } })
    );
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
    const campaigns = await hydrateCampaigns(
      await listCampaigns({
        filter: { is_approved: true },
      })
    );
    const ended = campaigns.filter((c) => c.campaign_status === "Ended");
    return res.json(
      responseData({
        success: 1,
        message: "Ended campaigns loaded",
        extra: { campaigns: ended },
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
    const campaigns = await hydrateCampaigns(
      await listCampaigns({
        filter: { is_approved: true },
      })
    );
    const upcoming = campaigns.filter((c) => c.campaign_status === "Upcoming");
    return res.json(
      responseData({
        success: 1,
        message: "Upcoming campaigns loaded",
        extra: { campaigns: upcoming },
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
    const mine = (await hydrateCampaigns(campaigns)).filter(
      (c) => String(c.user_id) === String(user.id)
    );
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
      // Supabase enum only allows Upcoming/Running/Ended; default to Upcoming and we
      // compute the live status on read based on dates.
      campaign_status: "Upcoming",
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
    const favIds = favourites.map((f) => f.campaign_id).filter(Boolean);

    const campaignsRaw = favIds.length
      ? await listCampaignsByIds(favIds)
      : [];

    const campaigns = await hydrateCampaigns(campaignsRaw);
    return res.json(
      responseData({
        success: 1,
        message: "Favourites loaded",
        extra: { campaigns },
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
