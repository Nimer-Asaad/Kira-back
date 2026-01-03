const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const {
  getStatus,
  connectGmail,
  handleCallback,
  disconnectGmail,
  syncEmails,
  listEmails,
  getEmailDetails,
  deleteEmail,
  markAsRead,
  summarizeEmail,
} = require("../controllers/personalGmailController");

/**
 * Personal Gmail integration routes
 */

// OAuth routes
router.get("/gmail/status", protect, getStatus);
router.post("/gmail/connect", protect, connectGmail); // POST with auth
router.get("/gmail/connect", connectGmail); // GET with token (legacy support)
router.get("/gmail/callback", handleCallback); // Public - called by Google
router.post("/gmail/disconnect", protect, disconnectGmail);

// Email sync and management
router.post("/emails/sync", protect, syncEmails);
router.get("/emails", protect, listEmails);
router.get("/emails/:id", protect, getEmailDetails);
router.delete("/emails/:id", protect, deleteEmail);
router.post("/emails/:id/mark-read", protect, markAsRead);
router.post("/emails/:id/summarize", protect, summarizeEmail);

module.exports = router;

