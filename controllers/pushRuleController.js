const { verifyAdminAccess } = require("../config/verification");
const {
  getRules,
  saveRule,
  removeRule,
  publishRules,
  getLatestConfig,
  clearCache,
} = require("../services/pushConfigService");
const { listUserDevices } = require("../services/supabaseContentService");
const { sendDataMessage } = require("../services/sendNotification");
const logger = require("../config/logger");

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

const loadPushRules = async (req, res) => {
  await verifyAdminAccess(req, res, async () => {
    const rules = await getRules();
    const published = await getLatestConfig();
    return res.render("pushRules", {
      rules,
      published,
      flash: req.flash(),
    });
  });
};

const createOrUpdateRule = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const payload = {
        id: req.body.id || undefined,
        name: req.body.name,
        trigger: req.body.trigger,
        status: req.body.status || "draft",
        priority: Number(req.body.priority || 100),
        audience: parseJsonField(req.body.audience, { all: true }),
        constraints: parseJsonField(req.body.constraints, {}),
        payload: parseJsonField(req.body.payload, {}),
        min_app_version: req.body.min_app_version || null,
      };

      await saveRule(payload);
      req.flash("success", payload.id ? "Rule updated" : "Rule created");
      return res.redirect(process.env.BASE_URL + "push-rules");
    });
  } catch (error) {
    logger.error("createOrUpdateRule failed", { err_message: error.message });
    req.flash("error", "Failed to save rule");
    return res.redirect(process.env.BASE_URL + "push-rules");
  }
};

const deleteRule = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const { id } = req.params;
      if (id) {
        await removeRule(id);
        req.flash("success", "Rule deleted");
      }
      return res.redirect(process.env.BASE_URL + "push-rules");
    });
  } catch (error) {
    logger.error("deleteRule failed", { err_message: error.message });
    req.flash("error", "Failed to delete rule");
    return res.redirect(process.env.BASE_URL + "push-rules");
  }
};

const publish = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const comment = req.body.comment || "";
      const published = await publishRules({ comment });

      // Clear cache and send silent refresh
      await clearCache();
      const devices = await listUserDevices();
      const tokens = [
        ...new Set(
          (devices || [])
            .map((d) => d.registration_token?.trim())
            .filter(Boolean)
        ),
      ];
      if (tokens.length) {
        await sendDataMessage(tokens, {
          type: "config_refresh",
          version: String(published.version),
        });
      }

      req.flash("success", `Published version ${published.version}`);
      return res.redirect(process.env.BASE_URL + "push-rules");
    });
  } catch (error) {
    logger.error("publish push rules failed", { err_message: error.message });
    req.flash("error", "Failed to publish rules");
    return res.redirect(process.env.BASE_URL + "push-rules");
  }
};

module.exports = {
  loadPushRules,
  createOrUpdateRule,
  deleteRule,
  publish,
};
