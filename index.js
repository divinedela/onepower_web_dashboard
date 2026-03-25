// index.js
require("dotenv").config();
// Optional New Relic (opt-in via ENABLE_NEW_RELIC=true)
let newrelic = { noticeError: () => {} };
const enableNewRelic =
  String(process.env.ENABLE_NEW_RELIC || "").toLowerCase() === "true" &&
  !!process.env.NEW_RELIC_LICENSE_KEY;
if (enableNewRelic) {
  try {
    newrelic = require("newrelic");
  } catch (e) {
    console.warn("New Relic disabled (failed to load):", e.message);
  }
} else {
  process.env.NEW_RELIC_ENABLED = "false";
}

const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const flash = require("connect-flash");
const path = require("path");

// import logger DIRECTLY from config (stable API)
const logger = require("./config/logger");
// import middleware functions
const {
  requestId,
  morganToWinston,
  addNrContext,
} = require("./middleware/requestLogger");
const { adminOriginGuard } = require("./middleware/adminOriginGuard");

const isSupabaseDataProvider = true;
const { logSupabaseEnvStatus } = require("./config/supabaseEnv");

// flash helpers
const flashmiddleware = require("./config/flash");

// app
const app = express();
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

// ---- logging & tracing ----
app.use(requestId);
app.use(morganToWinston);
app.use(addNrContext);

// ---- session ----
const sessionConfig = {
  secret: process.env.SESSION_SECRET_KEY || "onepower-dev-session-secret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
  },
};

if (!isSupabaseDataProvider) {
  logger.warn(
    "Running with DATA_PROVIDER=supabase. Only migrated admin routes are enabled; Mongo-backed modules remain disabled."
  );
  logSupabaseEnvStatus(logger);
}

app.use(
  session(sessionConfig)
);

// flash
app.use(flash());
app.use(flashmiddleware.setflash);

// parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  bodyParser.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith("/api/webhooks/paystack")) {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// routes (Supabase-only)
const supabaseBootstrapRoutes = require("./routes/apiSupabaseBootstrapRoutes.js");
app.use("/api", supabaseBootstrapRoutes);

const adminRoutes = require("./routes/adminRoutes.js");
app.use(process.env.BASE_URL, adminOriginGuard, adminRoutes);

// 404
app.use((req, res) => {
  logger.warn("Route not found", { requestId: req.id, url: req.originalUrl });
  if (isSupabaseDataProvider || req.originalUrl?.startsWith("/api")) {
    return res.status(404).json({
      ok: false,
      error: "Not Found",
      requestId: req.id || null,
    });
  }
  return res.status(404).render("404");
});

// central error handler
app.use((err, req, res, next) => {
  // local console for dev
  console.log("eerr here", err);
  const newrelic = require("newrelic");
  newrelic.noticeError(err, { requestId: req?.id, url: req?.originalUrl });

  logger.error("Unhandled error", {
    requestId: req?.id,
    url: req?.originalUrl,
    err_message: err.message,
    stack: err.stack,
  });

  if (isSupabaseDataProvider || req.xhr || req.originalUrl?.startsWith("/api")) {
    res
      .status(500)
      .json({ error: "Internal Server Error", requestId: req?.id });
  } else {
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL || "/");
  }
});

// process-level safety
process.on("unhandledRejection", (reason) => {
  try {
    newrelic.noticeError(reason instanceof Error ? reason : new Error(String(reason)));
  } catch (_) {}
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (err) => {
  try {
    newrelic.noticeError(err);
  } catch (_) {}
  logger.error("Uncaught Exception", {
    err_message: err.message,
    stack: err.stack,
  });
  // ensure visibility in console for crashes
  console.error("Uncaught Exception", err);
  // consider graceful shutdown in production
});

const defaultHost = process.env.HOST || "0.0.0.0";
let port = Number(process.env.PORT || 4000);
let fallbackUsed = false;

const startServer = (p, bindHost = defaultHost) => {
  const server = app.listen(p, bindHost, () => {
    const addr = server.address();
    const listenHost = typeof addr === "string" ? addr : addr?.address;
    const listenPort = typeof addr === "string" ? "" : addr?.port;
    console.log(`Server started on ${listenHost}:${listenPort}`);
  });

  server.on("error", (err) => {
    logger.error("Server listen error", {
      err_message: err.message,
      stack: err.stack,
      host: bindHost,
      port: p,
    });

    if (!fallbackUsed && (err.code === "EACCES" || err.code === "EADDRINUSE" || err.code === "EPERM")) {
      fallbackUsed = true;
      const fallbackPort = 0; // OS-assigned
      const fallbackHost = "127.0.0.1";
      logger.warn("Retrying server listen on fallback host/port", {
        host: bindHost,
        fallbackHost,
        previousPort: p,
      });
      startServer(fallbackPort, fallbackHost);
      return;
    }

    process.exit(1);
  });
};

startServer(port);
