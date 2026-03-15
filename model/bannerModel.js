// model/bannerModel.js
const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    image: { type: String, required: true, trim: true }, // Firebase public URL
    title: { type: String, required: true, trim: true },
    newsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "news",
      required: true,
    },
    status: {
      type: String,
      enum: ["Publish", "UnPublish"],
      default: "Publish",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("banner", bannerSchema);
