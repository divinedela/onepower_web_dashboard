// index.js
require("dotenv").config();
require("newrelic");

const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
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

const dataProvider = (process.env.DATA_PROVIDER || "mongodb").toLowerCase();
const isSupabaseDataProvider = dataProvider === "supabase";
const { logSupabaseEnvStatus } = require("./config/supabaseEnv");

// DB connect (Mongo mode only)
if (!isSupabaseDataProvider) {
  require("./config/conn.js");
}

// flash helpers
const flashmiddleware = require("./config/flash");

// app
const app = express();

// ---- logging & tracing ----
app.use(requestId);
app.use(morganToWinston);
app.use(addNrContext);

// ---- session ----
const sessionConfig = {
  secret: process.env.SESSION_SECRET_KEY || "onepower-dev-session-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
};

if (!isSupabaseDataProvider) {
  const MongoStore = require("connect-mongo");
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.DB_CONNECTION,
    ttl: 3600,
  });
} else {
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

// passport
app.use(passport.initialize());
app.use(passport.session());

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// routes
if (!isSupabaseDataProvider) {
  const adminRoutes = require("./routes/adminRoutes.js");
  app.use(process.env.BASE_URL, adminRoutes);

  const apiRoutes = require("./routes/apiRoutes.js");
  app.use("/api", apiRoutes);
} else {
  const supabaseBootstrapRoutes = require("./routes/apiSupabaseBootstrapRoutes.js");
  const adminRoutes = require("./routes/adminRoutes.js");
  app.use(process.env.BASE_URL, adminRoutes);
  app.use("/api", supabaseBootstrapRoutes);
}

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
  const newrelic = require("newrelic");
  newrelic.noticeError(
    reason instanceof Error ? reason : new Error(String(reason))
  );
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (err) => {
  const newrelic = require("newrelic");
  newrelic.noticeError(err);
  logger.error("Uncaught Exception", {
    err_message: err.message,
    stack: err.stack,
  });
  // consider graceful shutdown in production
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log("Server is start", port);
});
