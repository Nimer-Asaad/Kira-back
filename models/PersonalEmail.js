const mongoose = require("mongoose");

const personalEmailSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gmailMessageId: {
      type: String,
      required: true,
      index: true,
    },
    threadId: {
      type: String,
      default: "",
    },
    fromName: {
      type: String,
      default: "",
    },
    fromEmail: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      default: "(no subject)",
    },
    snippet: {
      type: String,
      default: "",
    },
    bodyText: {
      type: String,
      default: "",
    },
    bodyHtml: {
      type: String,
      default: null,
    },
    receivedAt: {
      type: Date,
      required: true,
      index: true,
    },
    labels: [{
      type: String,
    }],
    isRead: {
      type: Boolean,
      default: false,
    },
    importance: {
      type: Number,
      enum: [1, 2, 3, 4, 5],
      default: 3,
    },
    category: {
      type: String,
      enum: ["Work", "Bills", "Social", "Promotions", "Urgent", "Other"],
      default: "Other",
    },
    aiSummary: {
      type: String,
      default: null,
    },
    aiBullets: [{
      type: String,
    }],
    aiTodo: [{
      type: String,
    }],
    lastSummarizedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique emails per user
personalEmailSchema.index({ ownerUserId: 1, gmailMessageId: 1 }, { unique: true });

module.exports = mongoose.model("PersonalEmail", personalEmailSchema);

