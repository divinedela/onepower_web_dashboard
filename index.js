// Import required modules
require("dotenv").config();
require("newrelic");
const {
  requestId,
  morganToWinston,
  addNrContext,
  logger,
} = require("./middleware/requestLogger");



const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const path = require("path");
const MongoStore = require("connect-mongo");

// Configure dotenv
dotenv.config();

// import database connect file
require("./config/conn.js");

// Import flash middleware
const flashmiddleware = require("./config/flash");

// Create an express app
const app = express();

app.use(requestId);
app.use(morganToWinston);
app.use(addNrContext);
// Configure session
app.use(
  session({
    secret: process.env.SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: process.env.DB_CONNECTION,
      ttl: 3600,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

// Use flash middleware
app.use(flash());
app.use(flashmiddleware.setflash);

// Configure body-parser for handling form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Configure passport for authentication
app.use(passport.initialize());
app.use(passport.session());

// Configure body-parser for handling form data
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//Routes for admin
const adminRoutes = require("./routes/adminRoutes.js");
app.use(process.env.BASE_URL, adminRoutes);

//Routes for api
const apiRoutes = require("./routes/apiRoutes.js");
app.use("/api", apiRoutes);

app.use((req, res) => {
  logger.warn({ requestId: req.id, url: req.originalUrl }, "Route not found");
  res.status(404).render("404");
});

// Central error handler
app.use((err, req, res, next) => {
  const newrelic = require("newrelic");
  newrelic.noticeError(err, { requestId: req?.id, url: req?.originalUrl });
  logger.error(
    {
      requestId: req?.id,
      url: req?.originalUrl,
      stack: err.stack,
      message: err.message,
    },
    "Unhandled error"
  );

  if (req.xhr || req.originalUrl?.startsWith("/api")) {
    res
      .status(500)
      .json({ error: "Internal Server Error", requestId: req?.id });
  } else {
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(process.env.BASE_URL || "/");
  }
});

process.on("unhandledRejection", (reason) => {
  const newrelic = require("newrelic");
  newrelic.noticeError(
    reason instanceof Error ? reason : new Error(String(reason))
  );
  logger.error({ reason }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  const newrelic = require("newrelic");
  newrelic.noticeError(err);
  logger.error(
    { stack: err.stack, message: err.message },
    "Uncaught Exception"
  );
  // consider graceful shutdown in production
});

const port = process.env.PORT || 4000;

//Create server
app.listen(port, () => {
  console.log("Server is start", port);
});
