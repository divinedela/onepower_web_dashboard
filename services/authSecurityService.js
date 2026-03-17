let Redis = null;
try {
  // optional dependency; will be null if not installed
  // eslint-disable-next-line global-require
  Redis = require("ioredis");
} catch (_) {
  Redis = null;
}

const rateLimitBuckets = new Map();
const signInLockouts = new Map();
let redisClient = null;

function getRedis() {
  if (!Redis) return null;
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!url) return null;
  redisClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  redisClient.on("error", () => {});
  redisClient.connect().catch(() => {});
  return redisClient;
}

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "unknown"
  );
}

async function takeRateLimit(bucketKey, { limit, windowMs }) {
  const redis = getRedis();
  if (redis) {
    const key = `rl:${bucketKey}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    const ttlMs = await redis.pttl(key);
    const retryAfterSec = Math.max(1, Math.ceil(ttlMs / 1000));
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec,
    };
  }

  const now = nowMs();
  const current = rateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitBuckets.set(bucketKey, next);
    return {
      allowed: true,
      remaining: Math.max(0, limit - next.count),
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  current.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfterSec,
  };
}

function createApiRateLimitMiddleware({
  bucket,
  limit,
  windowMs,
  message = "Too many requests. Please try again later.",
}) {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const result = await takeRateLimit(`${bucket}:${ip}`, { limit, windowMs });
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("Retry-After", String(result.retryAfterSec));

    if (result.allowed) return next();

    const resolvedMessage = (() => {
      if (typeof message === "function") {
        try {
          return message(result);
        } catch (_) {
          return "Too many requests. Please try again later.";
        }
      }
      return String(message).replace(
        /\{retryAfterSec\}/g,
        String(result.retryAfterSec)
      );
    })();

    return res.status(429).json({
      data: {
        success: 0,
        message: resolvedMessage,
        error: 1,
      },
    });
  };
}

function lockoutKey({ scope, email, ip }) {
  return `${scope}:${String(email || "").trim().toLowerCase()}:${String(ip || "unknown")}`;
}

async function getSignInLockoutStatus({ scope, email, ip }) {
  const key = lockoutKey({ scope, email, ip });
  const redis = getRedis();
  if (redis) {
    const data = await redis.get(`lock:${key}`);
    if (!data) return { blocked: false, retryAfterSec: 0 };
    const state = JSON.parse(data);
    const now = nowMs();
    if (!state.lockUntil || state.lockUntil <= now) return { blocked: false, retryAfterSec: 0 };
    const retryAfterSec = Math.max(1, Math.ceil((state.lockUntil - now) / 1000));
    return { blocked: true, retryAfterSec };
  }

  const state = signInLockouts.get(key);
  const now = nowMs();
  if (!state || !state.lockUntil || state.lockUntil <= now) {
    return { blocked: false, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((state.lockUntil - now) / 1000));
  return { blocked: true, retryAfterSec };
}

async function registerSignInFailure({ scope, email, ip }) {
  const key = lockoutKey({ scope, email, ip });
  const redis = getRedis();
  const now = nowMs();

  if (redis) {
    const data = await redis.get(`lock:${key}`);
    const state = data ? JSON.parse(data) : { failures: 0, lockUntil: 0 };
    state.failures += 1;

    if (state.failures >= 3) {
      const exponent = Math.max(0, state.failures - 3);
      const backoffSeconds = Math.min(900, 30 * Math.pow(2, exponent));
      state.lockUntil = now + backoffSeconds * 1000;
    } else {
      state.lockUntil = 0;
    }

    await redis.set(`lock:${key}`, JSON.stringify(state), "PX", 30 * 60 * 1000);
    return;
  }

  const state = signInLockouts.get(key) || { failures: 0, lockUntil: 0 };
  state.failures += 1;

  if (state.failures >= 3) {
    const exponent = Math.max(0, state.failures - 3);
    const backoffSeconds = Math.min(900, 30 * Math.pow(2, exponent));
    state.lockUntil = now + backoffSeconds * 1000;
  } else {
    state.lockUntil = 0;
  }

  signInLockouts.set(key, state);
}

async function registerSignInSuccess({ scope, email, ip }) {
  const key = lockoutKey({ scope, email, ip });
  const redis = getRedis();
  if (redis) {
    await redis.del(`lock:${key}`);
  } else {
    signInLockouts.delete(key);
  }
}

module.exports = {
  getClientIp,
  createApiRateLimitMiddleware,
  getSignInLockoutStatus,
  registerSignInFailure,
  registerSignInSuccess,
};
