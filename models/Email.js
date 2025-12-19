const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gmailId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    threadId: {
      type: String,
      index: true,
    },
    from: {
      type: String,
    },
    to: [String],
    cc: [String],
    bcc: [String],
    subject: {
      type: String,
      default: '(no subject)',
    },
    snippet: {
      type: String,
    },
    body: {
      type: String,
      default: null,
    },
    date: {
      type: Date,
    },
    internalDate: {
      type: String,
    },
    labelIds: [String],
    hasAttachments: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    raw: {
      type: String,
      default: null,
    },
    aiSummary: {
      summary: String,
      key_points: [String],
      action_items: [String],
      urgency: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low',
      },
      suggested_stage: {
        type: String,
        enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'unknown'],
        default: 'unknown',
      },
      generatedAt: Date,
    },
    lastModifiedTime: String,
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

emailSchema.index({ userId: 1, date: -1 });
emailSchema.index({ userId: 1, labelIds: 1 });

module.exports = mongoose.model('Email', emailSchema);
