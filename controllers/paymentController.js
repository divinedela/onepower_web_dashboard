// Paystack integration using Supabase for donation storage
const axios = require("axios");
const crypto = require("crypto");
const {
  insertDonation,
  getDonationByReference,
  updateDonationByReference,
} = require("../services/supabaseContentService");

let appLogger = null;
try {
  appLogger = require("../middleware/requestLogger").logger;
} catch (_) {}

const log = (level, msg, meta = {}) => {
  if (appLogger?.[level]) appLogger[level](meta, msg);
  else
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `${msg} ${JSON.stringify(meta)}`
    );
};

const {
  PAYSTACK_SECRET_KEY,
  PAYSTACK_PUBLIC_KEY, // not used server-side, but read for completeness
  PAYSTACK_WEBHOOK_SECRET,
  PUBLIC_HOST, // used to form callback/return
} = process.env;

const ps = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// helper
const nowIsoDate = () => new Date().toISOString().split("T")[0];

// Paystack return bounce (kept)
const paystackReturn = async (req, res) => {
  try {
    const { reference, status } = req.query;
    const deepLink = `onepower://paystack/callback?reference=${encodeURIComponent(
      reference || ""
    )}&status=${encodeURIComponent(status || "")}`;
    return res.redirect(deepLink);
  } catch (e) {
    console.error("paystackReturn error", e.message);
    return res.status(200).send("You can close this window now.");
  }
};

const test = async (_req, res) => {
  res.json({ test: "working" });
};

// --------- Paystack: Initialize (creates Pending donation in Supabase) ----------
const paystackCreate = async (req, res) => {
  try {
    const userId = String(req.user?.id || req.user?._id || "");
    const { campaignId, amountMajor, currency = "GHS", email } = req.body;
    const normalizedCurrency = String(currency || "GHS").toUpperCase();
    const amountMajorNum = Number(amountMajor);

    if (!campaignId || !email || !userId || !amountMajorNum || amountMajorNum <= 0) {
      return res.json({
        data: { success: 0, message: "Missing required fields", error: 1 },
      });
    }

    if (!PUBLIC_HOST) {
      return res.json({
        data: { success: 0, message: "Payment callback host not configured", error: 1 },
      });
    }

    const reference = `PS_${campaignId}_${Date.now()}_${Math.floor(Math.random() * 9e6 + 1e6)}`;
    const callback_url = `${PUBLIC_HOST}/payments/paystack/return`;
    const amountKobo = Math.round(amountMajorNum * 100);

    const initPayload = {
      email,
      amount: amountKobo,
      currency: normalizedCurrency,
      reference,
      callback_url,
      metadata: { campaignId, userId },
    };

    const resp = await ps.post("/transaction/initialize", initPayload);
    const data = resp?.data?.data;
    if (!data?.authorization_url) {
      return res.json({
        data: { success: 0, message: "Failed to create Paystack transaction", error: 1 },
      });
    }

    await insertDonation({
      user_id: userId,
      campaign_id: campaignId,
      amount: amountMajorNum,
      currency: normalizedCurrency,
      date: nowIsoDate(),
      payment_method: "Paystack",
      transaction_id: reference,
      payment_status: "Pending",
      authorization_url: data.authorization_url,
    });

    return res.json({
      data: {
        success: 1,
        message: "Init ok",
        authorizationUrl: data.authorization_url,
        reference,
        error: 0,
      },
    });
  } catch (e) {
    console.error("paystackCreate error", e?.response?.data || e.message);
    return res
      .status(500)
      .json({ data: { success: 0, message: "An error occurred", error: 1 } });
  }
};

// --------- Paystack: Verify (idempotent) ----------
const paystackVerify = async (req, res) => {
  try {
    const requesterUserId = String(req.user?.id || req.user?._id || "");
    const { reference } = req.body;
    if (!reference) {
      return res.json({
        data: {
          success: 0,
          message: "reference is required",
          status: "failed",
          error: 1,
        },
      });
    }

    const donation = await getDonationByReference(reference);
    if (!donation) {
      return res.json({
        data: {
          success: 0,
          message: "Unknown reference",
          status: "failed",
          error: 1,
        },
      });
    }

    if (String(donation.user_id) !== requesterUserId) {
      return res.json({
        data: {
          success: 0,
          message: "Unauthorized reference access",
          status: "failed",
          error: 1,
        },
      });
    }

    if (donation.payment_status !== "Pending") {
      return res.json({
        data: {
          success: 1,
          message: "Already verified",
          status: donation.payment_status === "Successful" ? "success" : "failed",
          amount: donation.amount * 100,
          currency: donation.currency,
          error: 0,
        },
      });
    }

    const ver = await ps.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    const d = ver?.data?.data;
    if (!d) {
      await updateDonationByReference(reference, {
        payment_status: "Failed",
        failure_reason: "Verification: empty response",
      });
      return res.json({
        data: {
          success: 0,
          message: "Verification failed",
          status: "failed",
          error: 1,
        },
      });
    }

    const amountKobo = Math.round(Number(donation.amount) * 100);
    const amountMatches = Number(d.amount) === amountKobo;
    const currencyMatches =
      (d.currency || "").toUpperCase() === (donation.currency || "GHS").toUpperCase();

    let final = { payment_status: "Failed", failure_reason: "" };
    if ((d.status || "").toLowerCase() === "success" && amountMatches && currencyMatches) {
      final.payment_status = "Successful";
    } else {
      const reasons = [];
      if ((d.status || "").toLowerCase() !== "success") reasons.push(`ps_status=${d.status}`);
      if (!amountMatches) reasons.push(`amount_mismatch ps=${d.amount} our=${amountKobo}`);
      if (!currencyMatches) reasons.push(`currency_mismatch ps=${d.currency} our=${donation.currency}`);
      final.failure_reason = reasons.join("; ");
      if (!amountMatches || !currencyMatches) final.flagged = true;
    }

    await updateDonationByReference(reference, final);

    return res.json({
      data: {
        success: 1,
        message: "Payment verified",
        status: final.payment_status === "Successful" ? "success" : "failed",
        amount: d.amount,
        currency: d.currency,
        error: 0,
      },
    });
  } catch (e) {
    console.error("paystackVerify error", e?.response?.data || e.message);
    return res.json({
      data: {
        success: 0,
        message: "Verification error",
        status: "failed",
        error: 1,
      },
    });
  }
};

// --------- Paystack: Webhook (idempotent) ----------
const paystackWebhook = async (req, res) => {
  const requestId = req.id || null;
  const t0 = Date.now();

  try {
    const sig = req.headers["x-paystack-signature"];
    const secret = PAYSTACK_WEBHOOK_SECRET || PAYSTACK_SECRET_KEY;

    if (!secret || !sig) {
      return res.status(200).json({ error: "Missing secret or signature" });
    }

    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}));

    const computed = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    if (sig !== computed) {
      return res.status(200).json({ error: "Invalid signature" });
    }

    let event = req.body;
    if (Buffer.isBuffer(event)) {
      event = JSON.parse(event.toString("utf8"));
    } else if (typeof event === "string") {
      event = JSON.parse(event);
    }

    const type = event?.event || "unknown";
    const tx = event?.data || {};
    const reference = tx?.reference || null;

    if (!reference) {
      return res.status(200).json({ error: "Missing reference" });
    }

    const donation = await getDonationByReference(reference);
    if (!donation) {
      return res.status(200).json({ error: "Unknown reference; ignored" });
    }

    if (donation.payment_status !== "Pending") {
      return res.status(200).json({ message: "Already processed" });
    }

    const amountKobo = Math.round(Number(donation.amount) * 100);
    const amountMatches = Number(tx.amount) === amountKobo;
    const currencyMatches =
      (tx.currency || "").toUpperCase() === (donation.currency || "GHS").toUpperCase();

    let final = { payment_status: "Failed", failure_reason: "" };
    if (type === "charge.success" && amountMatches && currencyMatches) {
      final.payment_status = "Successful";
    } else {
      const reasons = [];
      if (type !== "charge.success") reasons.push(`event=${type}`);
      if (!amountMatches) reasons.push(`amount_mismatch ps=${tx.amount} our=${amountKobo}`);
      if (!currencyMatches) reasons.push(`currency_mismatch ps=${tx.currency} our=${donation.currency}`);
      final.failure_reason = reasons.join("; ");
      if (!amountMatches || !currencyMatches) final.flagged = true;
    }

    await updateDonationByReference(reference, final);

    log("info", "Paystack: donation updated", {
      requestId,
      reference,
      newStatus: final.payment_status,
      tookMs: Date.now() - t0,
      flagged: final.flagged || false,
    });

    return res.status(200).end();
  } catch (e) {
    log("error", "Paystack webhook error", {
      requestId,
      err: e?.message || String(e),
      tookMs: Date.now() - t0,
    });
    return res.status(200).end();
  }
};

module.exports = {
  paystackWebhook,
  paystackVerify,
  paystackReturn,
  paystackCreate,
  test,
};
