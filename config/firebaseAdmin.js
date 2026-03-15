// config/firebaseAdmin.js
const admin = require("firebase-admin");

let app;
if (!admin.apps.length) {
  const opts = {};
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    opts.credential = admin.credential.cert(
      JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    );
  } else {
    opts.credential = admin.credential.applicationDefault(); // uses GOOGLE_APPLICATION_CREDENTIALS or ADC
  }
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    opts.storageBucket = process.env.FIREBASE_STORAGE_BUCKET; // e.g. "your-project-id.appspot.com"
  }
  app = admin.initializeApp(opts);
} else {
  app = admin.app();
}

const bucket = admin.storage().bucket();
module.exports = { admin, bucket };
