// index.js
require("dotenv").config();
require("newrelic");

const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const path = require("path");
const MongoStore = require("connect-mongo");

// import logger DIRECTLY from config (stable API)
const logger = require("./config/logger");
// import middleware functions
const {
  requestId,
  morganToWinston,
  addNrContext,
} = require("./middleware/requestLogger");

// env
dotenv.config();

// DB connect
require("./config/conn.js");

// flash helpers
const flashmiddleware = require("./config/flash");

// app
const app = express();

// ---- logging & tracing ----
app.use(requestId);
app.use(morganToWinston);
app.use(addNrContext);

// ---- session ----
app.use(
  session({
    secret: process.env.SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: process.env.DB_CONNECTION,
      ttl: 3600,
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

// flash
app.use(flash());
app.use(flashmiddleware.setflash);

// parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// passport
app.use(passport.initialize());
app.use(passport.session());

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// routes
const adminRoutes = require("./routes/adminRoutes.js");
app.use(process.env.BASE_URL, adminRoutes);

const apiRoutes = require("./routes/apiRoutes.js");
app.use("/api", apiRoutes);

// 404
app.use((req, res) => {
  logger.warn("Route not found", { requestId: req.id, url: req.originalUrl });
  res.status(404).render("404");
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

  if (req.xhr || req.originalUrl?.startsWith("/api")) {
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
