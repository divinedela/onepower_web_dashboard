// Import required modules
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

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

//Create server
app.listen(PORT, () => {
  console.log("Server is start", process.env.SERVER_PORT);
});
