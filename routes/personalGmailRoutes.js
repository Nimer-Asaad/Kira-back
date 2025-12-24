const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getStatus,
  syncEmails,
  listEmails,
  getEmailDetails,
  summarizeEmail,
} = require('../controllers/personalGmailController');

/**
 * Personal Gmail integration routes
 * All routes require authentication
 */

// Status check
router.get('/status', protect, getStatus);

// Sync emails from Gmail
router.post('/sync', protect, syncEmails);

// List cached emails
router.get('/emails', protect, listEmails);

// Get email details
router.get('/emails/:id', protect, getEmailDetails);

// Generate AI summary
router.post('/emails/:id/summarize', protect, summarizeEmail);

module.exports = router;

