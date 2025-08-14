// newrelic.js
"use strict";

/**
 * Most values come from env so you can run the same build in dev/staging/prod.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || "onepower-admin"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },

  // APM key bits
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || "info",
  },

  // 🔥 Logs in context & forwarding to New Relic Logs
  application_logging: {
    forwarding: { enabled: true }, // forward stdout/stderr
    metrics: { enabled: true }, // log summary metrics
    local_decorating: { enabled: true }, // add NR link metadata into log lines
  },

  // Optional: tweak transaction traces
  transaction_tracer: {
    enabled: true,
    record_sql: "obfuscated",
  },

  // Optional: Capture attributes you add on the request
  attributes: {
    include: ["requestId", "userId", "ip", "route"],
  },
};
