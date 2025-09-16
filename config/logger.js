// config/logger.js
const winston = require("winston");
let nrFormatter = null;

// Safely load New Relic winston enricher (optional)
try {
  const nrFactory = require("@newrelic/winston-enricher");
  nrFormatter = nrFactory(winston); // returns a format factory
} catch {
  // package not installed or not available; continue without NR log enrichment
}

const level = process.env.LOG_LEVEL || "info";

// Base Winston logger
const base = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // attach NR linking metadata if available
    nrFormatter ? nrFormatter() : winston.format((info) => info)(),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || "onepower-admin",
    env: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.Console({
      level,
      format: winston.format.json(),
    }),
  ],
});

// ---- Helpers to guarantee a string `message` ----
function toPlain(v) {
  if (!v || typeof v !== "object") return {};
  if (v instanceof Error) return { err_message: v.message, stack: v.stack };
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return { value: String(v) };
  }
}

function normalize(args) {
  let message = "";
  let meta = {};
  const a0 = args[0],
    a1 = args[1];

  if (typeof a0 === "string") {
    message = a0;
    if (a1 && typeof a1 === "object") meta = toPlain(a1);
    else if (typeof a1 === "string") message = `${a0} ${a1}`;
    return { message, meta };
  }

  if (a0 instanceof Error) {
    message = a0.message || "Error";
    meta = Object.assign({ stack: a0.stack }, toPlain(a1 || {}));
    return { message, meta };
  }

  if (a0 && typeof a0 === "object" && typeof a1 === "string") {
    message = a1;
    meta = toPlain(a0);
    return { message, meta };
  }

  if (a0 && typeof a0 === "object") {
    try {
      message = JSON.stringify(a0);
    } catch {
      message = String(a0);
    }
    return { message, meta };
  }

  message = args.map((x) => (typeof x === "string" ? x : String(x))).join(" ");
  return { message, meta };
}

// Build a wrapped logger with stable API (.info/.warn/.error/.debug)
function wrapLogger(instance) {
  return {
    info(...args) {
      const { message, meta } = normalize(args);
      instance.log({ level: "info", message, ...meta });
    },
    warn(...args) {
      const { message, meta } = normalize(args);
      instance.log({ level: "warn", message, ...meta });
    },
    error(...args) {
      const { message, meta } = normalize(args);
      instance.log({ level: "error", message, ...meta });
    },
    debug(...args) {
      const { message, meta } = normalize(args);
      instance.log({ level: "debug", message, ...meta });
    },
    child(bindings = {}) {
      const child = instance.child(bindings);
      return wrapLogger(child);
    },
  };
}

module.exports = wrapLogger(base);
