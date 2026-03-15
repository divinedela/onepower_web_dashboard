// models/newsModel.js
const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    image: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    // NEW: optional project association
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "campaign", // ← your existing campaign model name
      required: false,
      index: true,
    },

    // Meta
    status: {
      type: String,
      enum: ["Publish", "UnPublish"],
      default: "Publish",
      trim: true,
    },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

// Simple text index for quick search
newsSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("news", newsSchema);
