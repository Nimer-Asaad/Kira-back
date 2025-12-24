const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Task description is required"],
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "submitted", "reviewed", "completed"],
      default: "pending",
    },
    // Due date is optional/nullable (imported tasks may not have a date)
    dueDate: {
      type: Date,
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignmentReason: {
      type: String,
      default: "",
    },
    requiredAssigneesCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    checklist: [
      {
        text: {
          type: String,
          required: true,
        },
        done: {
          type: Boolean,
          default: false,
        },
      },
    ],
    attachments: [
      {
        url: String,
        name: String,
      },
    ],
    // Training pipeline support
    type: {
      type: String,
      enum: ["training", "real"],
      default: "real",
    },
    ownerType: {
      type: String,
      enum: ["trainee", "employee"],
      default: "employee",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    maxPoints: {
      type: Number,
      default: null,
    },
    earnedPoints: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      enum: ["ai", "pdf", "manual"],
      default: "manual",
    },
    // Optional legacy rubric text (kept for compatibility)
    rubric: {
      type: String,
      default: "",
      trim: true,
    },
    // New explicit training task fields
    requirements: [{ type: String }],
    rubricItems: [
      {
        criterion: { type: String, required: true },
        maxPoints: { type: Number, default: 0 },
        keywords: [{ type: String }],
      },
    ],
    evaluationNotes: {
      type: String,
      default: "",
      trim: true,
    },
    dueAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    scoringBreakdown: {
      basePoints: { type: Number, default: 0 },
      earlyBonus: { type: Number, default: 0 },
      lateMinutes: { type: Number, default: 0 },
      latePenalty: { type: Number, default: 0 },
    },
    submission: {
      repoUrl: { type: String, default: "" },
      codeSnippet: { type: String, default: "" },
      notes: { type: String, default: "" },
      attachments: [
        {
          url: String,
          filename: String,
        },
      ],
      submittedAt: { type: Date, default: null },
    },
    aiEvaluation: {
      score: { type: Number, default: 0 },
      maxScore: { type: Number, default: 0 },
      percent: { type: Number, default: 0 },
      pass: { type: Boolean, default: false },
      breakdown: [
        {
          criterion: String,
          score: Number,
          maxPoints: Number,
          reasoning: String,
        },
      ],
      strengths: [{ type: String }],
      issues: [{ type: String }],
      suggestions: [{ type: String }],
      shortFeedback: { type: String, default: "" },
      evaluatedAt: { type: Date, default: null },
      model: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Task", taskSchema);
