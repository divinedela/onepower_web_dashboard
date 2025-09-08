const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "campaign",
      required: true,
    },
    amount: { type: Number, required: true, trim: true }, // major units
    currency: { type: String, default: "GHS", trim: true },
    payment_method: {
      type: String,
      required: true,
      trim: true,
    },
    transaction_id: {
      type: String,
      required: true,
      trim: true,
    },
    payment_status: {
      type: String,
      enum: ["Successful", "Failed"],
      required: true,
      trim: true,
    },
    payment_status: {
      type: String,
      enum: ["Pending", "Successful", "Failed"],
      required: true,
      trim: true,
      default: "Pending",
    },
    failure_reason: { type: String, default: "", trim: true },
    flagged: { type: Boolean, default: false }, // e.g., currency/amount mismatch, ended campaign, etc.
  },
  {
    timestamps: true,
  }
);

donationSchema.index({ transaction_id: 1 }, { unique: true, sparse: true });

module.exports = new mongoose.model("donation", donationSchema);
