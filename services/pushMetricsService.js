const logger = require("../config/logger");

/**
 * Placeholder metrics recorder.
 * In future, persist to table push_send_metrics or external APM.
 */
async function recordSendSummary({
  trigger,
  ruleId,
  tokens = 0,
  success = 0,
  failure = 0,
}) {
  try {
    logger.info("push metrics", { trigger, ruleId, tokens, success, failure });
    // TODO: insert into push_send_metrics table when available
  } catch (err) {
    logger.warn("push metrics log failed", { err_message: err.message });
  }
}

module.exports = {
  recordSendSummary,
};
