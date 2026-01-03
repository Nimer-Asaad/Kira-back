const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    start: {
      type: Date,
      required: true,
      index: true,
    },
    end: {
      type: Date,
      required: true,
    },
    allDay: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      enum: ["blue", "purple", "green", "orange", "red", "gray"],
      default: "blue",
    },
    reminderMinutes: {
      type: Number,
      default: null,
      // Common values: 5, 10, 30, 60, 1440 (1 day)
    },
    reminderMethod: {
      type: String,
      enum: ["in_app", "browser", "none"],
      default: "in_app",
    },
    repeat: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    repeatUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient date range queries
calendarEventSchema.index({ ownerUserId: 1, start: 1, end: 1 });

module.exports = mongoose.model("CalendarEvent", calendarEventSchema);

