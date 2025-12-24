const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const assistantController = require('../controllers/assistantController');

// POST /api/assistant/public
router.post('/public', protect, assistantController.handlePublicAssistant);

module.exports = router;
