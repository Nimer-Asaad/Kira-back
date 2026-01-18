const { translateText, translateBatch, clearCaches } = require('../utils/translator');

/**
 * POST /api/translate
 * Single or batch translation endpoint
 * 
 * Request:
 * - Single: { text: "Dashboard", targetLang: "ar" }
 * - Batch: { texts: ["Dashboard", "Tasks"], targetLang: "ar" }
 * 
 * Response: { translated: string } or { translations: object }
 */
const translateHandler = async (req, res) => {
  try {
    const { text, texts, targetLang = 'ar' } = req.body;

    // Validate input
    if (!text && !texts) {
      return res.status(400).json({
        error: 'Missing text or texts in request body',
      });
    }

    // Single translation
    if (text) {
      const translated = await translateText(text, targetLang);
      return res.json({
        original: text,
        translated,
        targetLang,
      });
    }

    // Batch translation
    if (Array.isArray(texts)) {
      const translations = await translateBatch(texts, targetLang);
      return res.json({
        translations,
        targetLang,
        count: texts.length,
      });
    }

    res.status(400).json({
      error: 'Invalid request format',
    });
  } catch (error) {
    console.error('Translation endpoint error:', error);
    res.status(500).json({
      error: 'Translation failed',
      message: error.message,
    });
  }
};

/**
 * GET /api/translate/stats
 * Get translation cache statistics
 */
const getCacheStats = async (req, res) => {
  try {
    const Translation = require('../models/Translation');
    const count = await Translation.countDocuments();

    res.json({
      cachedTranslations: count,
      status: 'ok',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get cache stats',
      message: error.message,
    });
  }
};

/**
 * DELETE /api/translate/cache
 * Clear translation cache (admin only)
 */
const clearTranslationCache = async (req, res) => {
  try {
    await clearCaches();
    res.json({
      message: 'Translation cache cleared',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message,
    });
  }
};

module.exports = {
  translateHandler,
  getCacheStats,
  clearTranslationCache,
};
