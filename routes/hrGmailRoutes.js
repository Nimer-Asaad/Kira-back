const express = require('express');
const router = express.Router();
const { protect, hrOrAdmin } = require('../middlewares/authMiddleware');
const {
  getStatus,
  syncEmails,
  listEmails,
  getEmailDetails,
  generateEmailSummary,
} = require('../controllers/hrGmailController');

/**
 * Gmail integration routes
 * All routes require authentication and HR/Admin role
 */

// Status check
router.get('/status', protect, hrOrAdmin, getStatus);

// Sync emails from Gmail
router.post('/sync', protect, hrOrAdmin, syncEmails);

// List cached emails
router.get('/emails', protect, hrOrAdmin, listEmails);

// Get email details
router.get('/emails/:id', protect, hrOrAdmin, getEmailDetails);

// Generate AI summary
router.post('/emails/:id/ai', protect, hrOrAdmin, generateEmailSummary);

module.exports = router;
