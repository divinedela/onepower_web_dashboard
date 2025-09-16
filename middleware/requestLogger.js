// middleware/requestLogger.js
const newrelic = require("newrelic");
const logger = require("../config/logger");
const { v4: uuidv4 } = require("uuid");
const morgan = require("morgan");

/** Attach a stable request ID */
function requestId(req, res, next) {
  const id = req.headers["x-request-id"] || uuidv4();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  res.locals.requestId = id;
  next();
}

/** Morgan → Winston bridge (string message + structured meta) */
const morganToWinston = morgan("combined", {
  stream: {
    write: (line) =>
      logger.info("http_access", {
        type: "http",
        line: line.trim(),
      }),
  },
});

/** Add NR attributes + emit HTTP summary after response */
function addNrContext(req, res, next) {
  const userId = req.user?.id || req.session?.userId || null;

  newrelic.addCustomAttributes({
    requestId: req.id,
    userId,
    ip: req.ip,
    route: req.originalUrl,
    method: req.method,
  });

  // request-scoped child logger
  req.logger = logger.child({ requestId: req.id, route: req.originalUrl });

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    req.logger.info("http_summary", {
      type: "http_summary",
      userId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: durationMs,
      ip: req.ip,
      ua: req.headers["user-agent"],
      referer: req.headers["referer"] || req.headers["referrer"],
      content_length: res.getHeader("content-length"),
    });
  });

  next();
}

module.exports = { requestId, morganToWinston, addNrContext };
