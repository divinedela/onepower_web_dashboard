const logger = require("../config/logger");
const {
  getLatestConfig,
} = require("./pushConfigService");
const {
  listUserDevices,
  listUserDevicesByUserIds,
  listFollowersByCampaign,
  listDonorsByCampaign,
} = require("./supabaseContentService");

function isWithinQuietHours(quietHours, now = new Date()) {
  if (!quietHours || !quietHours.start || !quietHours.end) return false;
  const [startH, startM] = String(quietHours.start || "").split(":").map(Number);
  const [endH, endM] = String(quietHours.end || "").split(":").map(Number);
  if (Number.isNaN(startH) || Number.isNaN(endH)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // spans midnight
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function applyTemplate(payload, context = {}) {
  const replacer = (value) =>
    String(value || "").replace(/\\{\\{(.*?)\\}\\}/g, (_match, key) => {
      const trimmed = String(key || "").trim();
      return trimmed in context ? String(context[trimmed]) : "";
    });

  return {
    title: replacer(payload.title || ""),
    body: replacer(payload.body || payload.message || ""),
    action: payload.action || null,
    deeplink: payload.deeplink || payload.link || null,
    data: payload.data || {},
  };
}

async function resolveAudienceTokens(rule, context = {}) {
  const audience = rule.audience || {};
  const tokens = new Set();

  // all users
  if (audience.all) {
    const devices = await listUserDevices();
    devices.forEach((d) => d.registration_token && tokens.add(d.registration_token.trim()));
  }

  // explicit user ids
  if (Array.isArray(audience.user_ids) && audience.user_ids.length) {
    const rows = await listUserDevicesByUserIds(audience.user_ids);
    rows.forEach((d) => d.registration_token && tokens.add(d.registration_token.trim()));
  }

  // followers of campaign
  if (audience.followers_of_campaign) {
    const userIds = await listFollowersByCampaign(audience.followers_of_campaign);
    if (userIds.length) {
      const rows = await listUserDevicesByUserIds(userIds);
      rows.forEach((d) => d.registration_token && tokens.add(d.registration_token.trim()));
    }
  }

  // donors of campaign
  if (audience.donors_of_campaign) {
    const userIds = await listDonorsByCampaign(audience.donors_of_campaign);
    if (userIds.length) {
      const rows = await listUserDevicesByUserIds(userIds);
      rows.forEach((d) => d.registration_token && tokens.add(d.registration_token.trim()));
    }
  }

  return [...tokens];
}

function ruleApplies(rule, trigger) {
  return rule && rule.status === "active" && rule.trigger === trigger;
}

async function selectRules(trigger) {
  const config = await getLatestConfig();
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const applicable = rules.filter((r) => ruleApplies(r, trigger));
  return applicable.sort((a, b) => (a.priority || 100) - (b.priority || 100));
}

async function evaluate(trigger, context = {}) {
  const rules = await selectRules(trigger);
  const now = new Date();
  const chosen = [];

  for (const rule of rules) {
    const quietHours = rule.constraints?.quiet_hours || rule.constraints?.quietHours;
    if (quietHours && isWithinQuietHours(quietHours, now)) {
      logger.info("Rule skipped due to quiet hours", { ruleId: rule.id, trigger });
      continue;
    }
    chosen.push(rule);
  }

  const outputs = [];
  for (const rule of chosen) {
    const tokens = await resolveAudienceTokens(rule, context);
    if (!tokens.length) continue;
    const payload = applyTemplate(rule.payload || {}, context);
    outputs.push({ rule, tokens, payload });
  }
  return outputs;
}

module.exports = {
  evaluate,
  selectRules,
  applyTemplate,
  isWithinQuietHours,
};
