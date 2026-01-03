const CalendarEvent = require("../models/CalendarEvent");

// Helper: Expand recurring events into occurrences
const expandRecurringEvents = (events, from, to) => {
  const expanded = [];
  
  for (const event of events) {
    if (event.repeat === "none") {
      // Single event - add if in range
      if (event.start <= to && event.end >= from) {
        expanded.push(event);
      }
    } else {
      // Recurring event - generate occurrences
      let currentStart = new Date(event.start);
      let currentEnd = new Date(event.end);
      const duration = currentEnd - currentStart;
      const repeatUntil = event.repeatUntil ? new Date(event.repeatUntil) : new Date(to);
      
      while (currentStart <= repeatUntil && currentStart <= to) {
        if (currentEnd >= from) {
          // This occurrence is in range
          expanded.push({
            ...event.toObject(),
            _id: `${event._id}_${currentStart.getTime()}`,
            start: new Date(currentStart),
            end: new Date(currentEnd),
            isRecurring: true,
            originalId: event._id,
          });
        }
        
        // Move to next occurrence
        if (event.repeat === "daily") {
          currentStart.setDate(currentStart.getDate() + 1);
          currentEnd.setTime(currentStart.getTime() + duration);
        } else if (event.repeat === "weekly") {
          currentStart.setDate(currentStart.getDate() + 7);
          currentEnd.setTime(currentStart.getTime() + duration);
        } else if (event.repeat === "monthly") {
          currentStart.setMonth(currentStart.getMonth() + 1);
          currentEnd.setTime(currentStart.getTime() + duration);
        }
      }
    }
  }
  
  return expanded;
};

// @desc    Get calendar events in date range
// @route   GET /api/personal/calendar?from=ISO&to=ISO
// @access  Private
const getCalendarEvents = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: "from and to query parameters are required (ISO date strings)" });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format. Use ISO 8601" });
    }

    // Find events that overlap with the range
    // An event overlaps if: event.start <= to AND event.end >= from
    const events = await CalendarEvent.find({
      ownerUserId: req.user._id,
      $or: [
        // Event starts in range
        { start: { $gte: fromDate, $lte: toDate } },
        // Event ends in range
        { end: { $gte: fromDate, $lte: toDate } },
        // Event spans the entire range
        { start: { $lte: fromDate }, end: { $gte: toDate } },
      ],
    }).sort({ start: 1 });

    // Expand recurring events
    const expandedEvents = expandRecurringEvents(events, fromDate, toDate);

    res.json(expandedEvents);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get single calendar event
// @route   GET /api/personal/calendar/:id
// @access  Private
const getCalendarEventById = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    console.error("Error fetching calendar event:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Create calendar event
// @route   POST /api/personal/calendar
// @access  Private
const createCalendarEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      start,
      end,
      allDay,
      color,
      reminderMinutes,
      reminderMethod,
      repeat,
      repeatUntil,
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!start || !end) {
      return res.status(400).json({ message: "Start and end dates are required" });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    // Validate start < end unless allDay
    if (!allDay && startDate >= endDate) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    // Validate color
    const validColors = ["blue", "purple", "green", "orange", "red", "gray"];
    if (color && !validColors.includes(color)) {
      return res.status(400).json({ message: "Invalid color" });
    }

    // Validate reminderMethod
    const validReminderMethods = ["in_app", "browser", "none"];
    if (reminderMethod && !validReminderMethods.includes(reminderMethod)) {
      return res.status(400).json({ message: "Invalid reminder method" });
    }

    // Validate repeat
    const validRepeats = ["none", "daily", "weekly", "monthly"];
    if (repeat && !validRepeats.includes(repeat)) {
      return res.status(400).json({ message: "Invalid repeat value" });
    }

    // Validate repeatUntil if repeat is not none
    if (repeat && repeat !== "none" && repeatUntil) {
      const repeatUntilDate = new Date(repeatUntil);
      if (isNaN(repeatUntilDate.getTime())) {
        return res.status(400).json({ message: "Invalid repeatUntil date" });
      }
      if (repeatUntilDate < startDate) {
        return res.status(400).json({ message: "repeatUntil must be after start date" });
      }
    }

    const event = await CalendarEvent.create({
      title: title.trim(),
      description: description?.trim() || "",
      location: location?.trim() || "",
      start: startDate,
      end: endDate,
      allDay: allDay || false,
      color: color || "blue",
      reminderMinutes: reminderMinutes || null,
      reminderMethod: reminderMethod || "in_app",
      repeat: repeat || "none",
      repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
      ownerUserId: req.user._id,
    });

    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: "Validation error", errors });
    }
    
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update calendar event
// @route   PATCH /api/personal/calendar/:id
// @access  Private
const updateCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const {
      title,
      description,
      location,
      start,
      end,
      allDay,
      color,
      reminderMinutes,
      reminderMethod,
      repeat,
      repeatUntil,
    } = req.body;

    // Update fields
    if (title !== undefined) event.title = title.trim();
    if (description !== undefined) event.description = description.trim();
    if (location !== undefined) event.location = location.trim();
    if (allDay !== undefined) event.allDay = allDay;
    if (color !== undefined) {
      const validColors = ["blue", "purple", "green", "orange", "red", "gray"];
      if (!validColors.includes(color)) {
        return res.status(400).json({ message: "Invalid color" });
      }
      event.color = color;
    }
    if (reminderMinutes !== undefined) event.reminderMinutes = reminderMinutes;
    if (reminderMethod !== undefined) {
      const validReminderMethods = ["in_app", "browser", "none"];
      if (!validReminderMethods.includes(reminderMethod)) {
        return res.status(400).json({ message: "Invalid reminder method" });
      }
      event.reminderMethod = reminderMethod;
    }
    if (repeat !== undefined) {
      const validRepeats = ["none", "daily", "weekly", "monthly"];
      if (!validRepeats.includes(repeat)) {
        return res.status(400).json({ message: "Invalid repeat value" });
      }
      event.repeat = repeat;
    }
    if (repeatUntil !== undefined) {
      event.repeatUntil = repeatUntil ? new Date(repeatUntil) : null;
    }

    // Handle date updates
    if (start !== undefined || end !== undefined) {
      const newStart = start ? new Date(start) : event.start;
      const newEnd = end ? new Date(end) : event.end;

      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      if (!event.allDay && newStart >= newEnd) {
        return res.status(400).json({ message: "End date must be after start date" });
      }

      event.start = newStart;
      event.end = newEnd;
    }

    await event.save();

    res.json(event);
  } catch (error) {
    console.error("Error updating calendar event:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete calendar event
// @route   DELETE /api/personal/calendar/:id
// @access  Private
const deleteCalendarEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    await CalendarEvent.findByIdAndDelete(req.params.id);

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};

