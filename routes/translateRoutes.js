const express = require('express');
const {
  translateHandler,
  getCacheStats,
  clearTranslationCache,
} = require('../controllers/translateController');

const router = express.Router();

// POST /api/translate - Single or batch translation
router.post('/', translateHandler);

// GET /api/translate/stats - Cache statistics
router.get('/stats', getCacheStats);

// DELETE /api/translate/cache - Clear cache (admin only)
router.delete('/cache', clearTranslationCache);

module.exports = router;
