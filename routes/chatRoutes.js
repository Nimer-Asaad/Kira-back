const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getConversation,
  getConversations,
  getUnreadCount,
  markAsRead,
  getAvailableUsers,
} = require("../controllers/chatController");
const { protect } = require("../middlewares/authMiddleware");

// All routes require authentication
router.use(protect);

// Send a message
router.post("/send", sendMessage);

// Get conversation with specific user
router.get("/conversation/:userModel/:userId", getConversation);

// Get all conversations
router.get("/conversations", getConversations);

// Get unread message count
router.get("/unread-count", getUnreadCount);

// Mark messages as read
router.post("/mark-read", markAsRead);

// Get available users to chat with
router.get("/available-users", getAvailableUsers);

module.exports = router;
