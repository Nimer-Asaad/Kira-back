const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  start: {
    type: String,
    required: true,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, // HH:mm format
  },
  end: {
    type: String,
    required: true,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, // HH:mm format
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  note: {
    type: String,
    default: "",
    trim: true,
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
    default: null,
  },
  status: {
    type: String,
    enum: ["planned", "done", "skipped"],
    default: "planned",
  },
  colorTag: {
    type: String,
    enum: ["none", "blue", "purple", "green", "orange"],
    default: "none",
  },
});

const dayPlanSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD format
      index: true,
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    blocks: [blockSchema],
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one plan per user per date
dayPlanSchema.index({ ownerUserId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DayPlan", dayPlanSchema);

