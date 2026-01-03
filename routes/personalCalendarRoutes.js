const express = require("express");
const router = express.Router();
const {
  getCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require("../controllers/personalCalendarController");
const { protect } = require("../middlewares/authMiddleware");

// All routes require authentication
router.use(protect);

// GET /api/personal/calendar?from=ISO&to=ISO - Get events in range
router.get("/calendar", getCalendarEvents);

// POST /api/personal/calendar - Create event
router.post("/calendar", createCalendarEvent);

// GET /api/personal/calendar/:id - Get single event
router.get("/calendar/:id", getCalendarEventById);

// PATCH /api/personal/calendar/:id - Update event
router.patch("/calendar/:id", updateCalendarEvent);

// DELETE /api/personal/calendar/:id - Delete event
router.delete("/calendar/:id", deleteCalendarEvent);

module.exports = router;

