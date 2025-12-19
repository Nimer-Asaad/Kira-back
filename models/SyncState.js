const mongoose = require('mongoose');

const syncStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scope: {
      type: String,
      default: 'INBOX',
      index: true,
    },
    pageToken: {
      type: String,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    totalMessages: {
      type: Number,
      default: 0,
    },
    syncedCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

syncStateSchema.index({ userId: 1, scope: 1 }, { unique: true });

module.exports = mongoose.model('SyncState', syncStateSchema);
