// ===== Paystack integration (keep Stripe/PayPal code above/below) =====
const axios = require("axios");
const crypto = require("crypto");
const donationModel = require("../model/donationModel");

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

// 1) Initialize transaction  -------------------------------------------
/**
 * POST /payments/paystack/create
 * body: { campaignId, amountMajor:number, currency:string, email:string, userId?:string }
 * output: { reference, authorizationUrl }
 *
 * Idempotency: if a Pending donation exists for (userId,campaignId,amount,currency) within 2m, return same reference.
 */
const paystackCreate = async (req, res) => {
  try {
    // verifyAccess middleware should set req.user (keep existing behavior elsewhere)
    const userId = req.user || req.body.userId;
    const { campaignId, amountMajor, currency = "GHS", email } = req.body;

    if (!campaignId || !amountMajor || !email || !userId) {
      return res.json({
        data: { success: 0, message: "Missing required fields", error: 1 },
      });
    }

    // Idempotency window = 2 minutes
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    const existing = await donationModel.findOne({
      userId,
      campaignId,
      amount: Number(amountMajor),
      currency: "GHS",
      payment_method: "Paystack",
      payment_status: "Pending",
      createdAt: { $gte: twoMinAgo },
    });

    if (existing?.transaction_id) {
      return res.json({
        data: {
          success: 1,
          message: "Reusing pending Paystack transaction",
          reference: existing.transaction_id,
          authorizationUrl: existing.metadata?.authorization_url, // may be undefined if not stored
          error: 0,
        },
      });
    }

    const reference = `PS_${campaignId}_${Date.now()}_${Math.floor(
      Math.random() * 9e6 + 1e6
    )}`;

    // Build return URL (Paystack-hosted page will bounce here; you redirect to app deep link)
    const callback_url = `${PUBLIC_HOST}/payments/paystack/return`;

    // Convert to kobo
    const amountKobo = Math.round(Number(amountMajor) * 100);

    // Initialize at Paystack
    const initPayload = {
      email,
      amount: amountKobo,
      currency: "GHS",
      reference,
      callback_url,
      metadata: { campaignId, userId },
    };

    console.log("first", initPayload);

    const resp = await ps.post("/transaction/initialize", initPayload);
    const data = resp?.data?.data;
    if (!data?.authorization_url) {
      return res.json({
        data: {
          success: 0,
          message: "Failed to create Paystack transaction",
          error: 1,
        },
      });
    }

    // Create PENDING donation row now
    await donationModel.create({
      userId,
      campaignId,
      amount: Number(amountMajor), // re major units
      currency,
      date: nowIsoDate(),
      payment_method: "Paystack",
      transaction_id: reference,
      payment_status: "Pending",
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

// 2) Return (browser bounce) --------------------------------------------
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

const test = async (req, res) => {
  res.json({ test: "working" });
};

// 3) Verify transaction --------------------------------------------------
/**
 * POST /payments/paystack/verify
 * body: { reference }
 * idempotent: returns existing final state if already finalized
 */
const paystackVerify = async (req, res) => {
  try {
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

    // Fetch our pending/recorded donation
    const donation = await donationModel.findOne({ transaction_id: reference });
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

    // If already finalized, return the current state (idempotent)
    if (donation.payment_status !== "Pending") {
      return res.json({
        data: {
          success: 1,
          message: "Already verified",
          status:
            donation.payment_status === "Successful" ? "success" : "failed",
          amount: donation.amount * 100,
          currency: donation.currency,
          error: 0,
        },
      });
    }

    // Query Paystack
    const ver = await ps.get(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    const d = ver?.data?.data;
    console.log("verofied data", JSON.stringify(d));
    if (!d) {
      await donationModel.updateOne(
        { _id: donation._id },
        {
          $set: {
            payment_status: "Failed",
            failure_reason: "Verification: empty response",
          },
        }
      );
      return res.json({
        data: {
          success: 0,
          message: "Verification failed",
          status: "failed",
          error: 1,
        },
      });
    }

    // Compare amounts/currency
    const amountKobo = Math.round(donation.amount * 100);
    const amountMatches = Number(d.amount) === amountKobo;

    let final = { payment_status: "Failed", failure_reason: "" };
    if ((d.status || "").toLowerCase() === "success" && amountMatches) {
      final.payment_status = "Successful";
      console.log("finak is successful");
    } else {
      const reasons = [];
      if ((d.status || "").toLowerCase() !== "success")
        reasons.push(`ps_status=${d.status}`);
      if (!amountMatches)
        reasons.push(`amount_mismatch ps=${d.amount} our=${amountKobo}`);
      final.failure_reason = reasons.join("; ");

      console.log("reason for failei", final.failure_reason);
      if (!amountMatches) final.flagged = true;
    }

    await donationModel.updateOne({ _id: donation._id }, { $set: final });

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

// 4) Webhook (idempotent; finalize server-side) -------------------------
/**
 * POST /webhooks/paystack
 * header: x-paystack-signature
 */
const paystackWebhook = async (req, res) => {
  console.log("webhook called", req.body);
  const requestId = req.id || null;
  const t0 = Date.now();

  try {
    const sig = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    console.log("secrete here", secret);

    if (!secret) {
      log("error", "Paystack: missing webhook secret", { requestId });
      return res.status(200).json({ error: "Missing secret" });
    }

    if (!sig) {
      log("warn", "Paystack: missing signature header", { requestId });
      return res
        .status(200)
        .json({ error: "Paystack: missing signature header" });
    }

    // IMPORTANT: req.body is a Buffer because route uses express.raw()
    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body || ""));

    const computed = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    if (sig !== computed) {
      log("warn", "Paystack: invalid signature", { requestId });
      return res.status(200).json({ error: "Invalid signature" });
    }

    // Parse JSON only after signature passes
    let event = req.body;

    const type = event?.event || "unknown";
    const tx = event?.data || {};
    const reference = tx?.reference || null;

    console.log(
      "info",
      "Paystack webhook received",
      JSON.stringify({
        requestId,
        type,
        reference,
      })
    );

    log("info", "Paystack webhook received", {
      requestId,
      type,
      reference,
    });

    if (!reference) {
      log("warn", "Paystack: missing reference in payload", {
        requestId,
        type,
      });
      return res
        .status(200)
        .json({ error: "Paystack: missing reference in payload" });
    }

    const donation = await donationModel.findOne({ transaction_id: reference });

    if (!donation) {
      log("warn", "Paystack: unknown reference; ignoring", {
        requestId,
        reference,
        type,
      });
      return res.status(200).json({ error: "Unknown reference; ignored" });
    }

    // Idempotency
    if (donation.payment_status !== "Pending") {
      log("info", "Paystack: already finalized", {
        requestId,
        reference,
        status: donation.payment_status,
      });
      return res.status(200).json({ message: "Already processed" });
    }

    // Validate amount/currency
    const amountKobo = Math.round(Number(donation.amount) * 100);
    const amountMatches = Number(tx.amount) === amountKobo;
    const currencyMatches =
      (tx.currency || "").toUpperCase() ===
      (donation.currency || "GHS").toUpperCase();

    let final = { payment_status: "Failed", failure_reason: "" };
    if (type === "charge.success" && amountMatches && currencyMatches) {
      final.payment_status = "Successful";
    } else {
      const reasons = [];
      if (type !== "charge.success") reasons.push(`event=${type}`);
      if (!amountMatches)
        reasons.push(`amount_mismatch ps=${tx.amount} our=${amountKobo}`);
      if (!currencyMatches)
        reasons.push(
          `currency_mismatch ps=${tx.currency} our=${donation.currency}`
        );
      final.failure_reason = reasons.join("; ");
      if (!amountMatches || !currencyMatches) final.flagged = true;
    }

    await donationModel.updateOne({ _id: donation._id }, { $set: final });

    console.log("info", "Paystack: donation updated", reference);

    log("info", "Paystack: donation updated", {
      requestId,
      reference,
      newStatus: final.payment_status,
      tookMs: Date.now() - t0,
      flagged: final.flagged || false,
    });

    // Always 200 to Paystack
    return res.status(200).end();
  } catch (e) {
    // Never bubble errors to Paystack; just log and 200
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
