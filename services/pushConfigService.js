const crypto = require("crypto");
let Redis = null;
try {
  // optional dependency
  // eslint-disable-next-line global-require
  Redis = require("ioredis");
} catch (_) {
  Redis = null;
}

const {
  listPushRules,
  createPushRule,
  updatePushRule,
  deletePushRule,
  getLatestPushRuleVersion,
  createPushRuleVersion,
  getPublicPushConfig,
} = require("./supabaseContentService");

const logger = require("../config/logger");

const CACHE_KEY = "push_config:latest";
const DEFAULT_TTL_MS = Number(process.env.PUSH_CONFIG_CACHE_TTL_MS || 300_000);

let redisClient = null;
let memoryCache = { value: null, etag: null, expiresAt: 0 };

function getRedis() {
  if (!Redis) return null;
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!url) return null;
  redisClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  redisClient.on("error", (err) => {
    logger.warn("Redis error (pushConfigService)", { err_message: err.message });
  });
  redisClient.connect().catch(() => {});
  return redisClient;
}

function computeEtag(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

async function getCachedConfig() {
  const now = Date.now();
  if (memoryCache.expiresAt > now && memoryCache.value) {
    return memoryCache;
  }
  const redis = getRedis();
  if (redis) {
    try {
      const data = await redis.get(CACHE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        memoryCache = { ...parsed, expiresAt: now + DEFAULT_TTL_MS };
        return memoryCache;
      }
    } catch (err) {
      logger.warn("Failed to read push config from Redis", { err_message: err.message });
    }
  }
  return null;
}

async function setCachedConfig(value) {
  const payload = {
    value,
    etag: computeEtag(value),
  };
  const expiresAt = Date.now() + DEFAULT_TTL_MS;
  memoryCache = { ...payload, expiresAt };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(payload), "PX", DEFAULT_TTL_MS);
    } catch (err) {
      logger.warn("Failed to write push config to Redis", { err_message: err.message });
    }
  }
  return payload;
}

async function clearCache() {
  memoryCache = { value: null, etag: null, expiresAt: 0 };
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(CACHE_KEY);
    } catch (_) {}
  }
}

async function getRules() {
  return listPushRules();
}

async function saveRule(payload) {
  if (payload.id) {
    return updatePushRule(payload.id, payload);
  }
  return createPushRule(payload);
}

async function removeRule(id) {
  return deletePushRule(id);
}

async function publishRules({ comment = "", createdBy = null } = {}) {
  const rules = await listPushRules();
  const activeRules = rules.filter((r) => r.status === "active");
  const latestVersion = await getLatestPushRuleVersion();
  const nextVersion = (latestVersion?.version || 0) + 1;
  const rulesJson = activeRules.map((r) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    audience: r.audience || {},
    constraints: r.constraints || {},
    payload: r.payload || {},
    min_app_version: r.min_app_version || null,
    priority: r.priority || 100,
  }));

  const checksum = computeEtag({ version: nextVersion, rulesJson });
  const inserted = await createPushRuleVersion({
    version: nextVersion,
    rules_json: rulesJson,
    checksum,
    comment,
    created_by: createdBy,
  });

  const enabled = process.env.PUSH_RULES_ENABLED !== "false";
  const minAppVersion = process.env.MIN_APP_VERSION || null;

  await clearCache();
  await setCachedConfig({
    version: inserted.version,
    published_at: inserted.published_at,
    enabled,
    min_app_version: minAppVersion,
    rules: rulesJson,
  });

  return inserted;
}

async function getLatestConfig({ bypassCache = false } = {}) {
  if (!bypassCache) {
    const cached = await getCachedConfig();
    if (cached?.value) return { ...cached.value, etag: cached.etag };
  }

  const config = (await getPublicPushConfig()) || null;
  if (!config) {
    const empty = { version: 0, published_at: null, rules: [], enabled: true, min_app_version: null };
    const cached = await setCachedConfig(empty);
    return { ...empty, etag: cached.etag };
  }

  const payload = {
    version: config.version || 0,
    published_at: config.published_at || config.publishedAt || null,
    enabled: config.enabled !== false,
    min_app_version: config.min_app_version || config.minAppVersion || null,
    rules: config.rules_json || config.rules || [],
  };
  const cached = await setCachedConfig(payload);
  return { ...payload, etag: cached.etag };
}

module.exports = {
  getRules,
  saveRule,
  removeRule,
  publishRules,
  getLatestConfig,
  clearCache,
};
