const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: "ar:hash_of_text"
    },
    originalText: {
      type: String,
      required: true,
    },
    translatedText: {
      type: String,
      required: true,
    },
    targetLanguage: {
      type: String,
      required: true,
      default: 'ar',
    },
    provider: {
      type: String,
      enum: ['openai', 'google', 'deepl'],
      default: 'openai',
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.95,
    },
    cached: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for faster lookups
translationSchema.index({ key: 1, targetLanguage: 1 });
translationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Translation', translationSchema);
