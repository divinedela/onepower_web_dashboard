// model/newsModel.js
const mongoose = require("mongoose");

const newsSchema = new mongoose.Schema(
  {
    // Main image (Firebase public URL)
    image: {
      type: String,
      required: true,
      trim: true,
    },

    // Core content
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String, // HTML or plain text
      required: true,
      trim: true,
    },

    // Meta
    status: {
      type: String,
      enum: ["Publish", "UnPublish"],
      default: "Publish",
      trim: true,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Simple text index for quick search
newsSchema.index({
  title: "text",
  description: "text",
});

module.exports = mongoose.model("news", newsSchema);
