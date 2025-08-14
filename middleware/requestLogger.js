const newrelic = require("newrelic");
const logger = require("../config/logger");
const { v4: uuidv4 } = require("uuid");
const morgan = require("morgan");

function requestId(req, res, next) {
  const id = req.headers["x-request-id"] || uuidv4();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  res.locals.requestId = id;
  next();
}

// Send Apache-combined line into Winston (then to stdout -> New Relic)
const morganToWinston = morgan("combined", {
  stream: { write: (line) => logger.info({ type: "http", line: line.trim() }) },
});

// Add attributes to the active NR transaction
function addNrContext(req, res, next) {
  // userId from your auth; adjust to your app
  const userId = req.user?.id || req.session?.userId || null;

  // Add as attributes so they appear on APM traces and can be used to filter logs
  newrelic.addCustomAttributes({
    requestId: req.id,
    userId,
    ip: req.ip,
    route: req.originalUrl,
  });

  // After response, log a short summary too
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
    logger.info({
      type: "http_summary",
      requestId: req.id,
      userId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: durationMs,
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestId, morganToWinston, addNrContext, logger };
