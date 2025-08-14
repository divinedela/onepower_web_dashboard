const { createLogger, format, transports } = require("winston");
const { createEnricher } = require("@newrelic/winston-enricher");

const level = process.env.LOG_LEVEL || "info";
const isProd = process.env.NODE_ENV === "production";

const logger = createLogger({
  level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || "onepower-admin",
    env: process.env.NODE_ENV || "development",
  },
  transports: [
    new transports.Console({
      level,
      format: format.json(),
    }),
  ],
});

module.exports = logger;
