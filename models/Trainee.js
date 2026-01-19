const mongoose = require("mongoose");

const traineeSchema = new mongoose.Schema(
  {
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Applicant",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "trial",
        "paused",
        "frozen",
        "cancelled",
        "withdraw_requested",
        "withdrawn",
        "needs_improvement",
        "part_time_candidate",
        "eligible_for_promotion",
        "promoted",
        "rejected",
        "archived",
      ],
      default: "trial",
    },
    position: {
      type: String,
      trim: true,
      default: "",
    },
    skillsSnapshot: {
      type: [String],
      default: [],
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    requiredTasksCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedTasksCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    promotedAt: {
      type: Date,
      default: null,
    },
    hrNotes: {
      type: String,
      default: "",
      trim: true,
    },
    hrFinalScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    hrDecision: {
      type: String,
      enum: [
        "trial",
        "needs_improvement",
        "part_time",
        "part_time_candidate",
        "ready_to_promote",
        "eligible_for_promotion",
        "promoted",
        "rejected",
      ],
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    hrScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    completionRate: {
      type: Number,
      default: 0,
    },
    totalEarnedPoints: {
      type: Number,
      default: 0,
    },
    averagePointsPerTask: {
      type: Number,
      default: 0,
    },
    onTimeTasksCount: {
      type: Number,
      default: 0,
    },
    earlyTasksCount: {
      type: Number,
      default: 0,
    },
    lateTasksCount: {
      type: Number,
      default: 0,
    },
    // Pause state
    pausedAt: {
      type: Date,
      default: null,
    },
    pauseUntil: {
      type: Date,
      default: null,
    },
    pausedReason: {
      type: String,
      trim: true,
      default: "",
    },
    pausedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Freeze state
    frozenAt: {
      type: Date,
      default: null,
    },
    freezeUntil: {
      type: Date,
      default: null,
    },
    frozenReason: {
      type: String,
      trim: true,
      default: "",
    },
    frozenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Cancel state
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: "",
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Withdraw state
    withdrawRequestedAt: {
      type: Date,
      default: null,
    },
    withdrawReason: {
      type: String,
      trim: true,
      default: "",
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    withdrawnBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Status last updated
    statusUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    // Training workflow status
    trainingStatus: {
      type: String,
      enum: ["active", "submitted", "expired"],
      default: "active",
    },
    trainingSubmittedAt: {
      type: Date,
      default: null,
    },
    trainingEndAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trainee", traineeSchema);
