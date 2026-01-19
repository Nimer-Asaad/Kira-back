const Task = require("../models/Task");
const Trainee = require("../models/Trainee");
const { evaluateTrainingTaskSubmission } = require("../services/trainingEval");
const { ensureOpenAI, MODEL } = require("../services/openaiClient");

// Helper: calculate points based on timing
function computePointsWithTiming(basePoints, dueAt, submittedAt) {
  if (!dueAt || !submittedAt) {
    return {
      earned: basePoints,
      basePoints: basePoints,
      earlyBonus: 0,
      lateMinutes: 0,
      latePenalty: 0,
    };
  }

  const dueTime = new Date(dueAt).getTime();
  const subTime = new Date(submittedAt).getTime();
  const diffMs = subTime - dueTime;
  const diffMinutes = Math.round(diffMs / 60000);

  let earned = basePoints;
  let earlyBonus = 0;
  let latePenalty = 0;
  let lateMinutes = 0;

  if (diffMinutes < 0) {
    // Early submission: +1 per day, max +3
    const earlyDays = Math.floor(Math.abs(diffMinutes) / (24 * 60));
    earlyBonus = Math.min(earlyDays, 3);
    earned += earlyBonus;
  } else if (diffMinutes > 0) {
    // Late submission: -1 per day, max -5
    const lateDays = Math.floor(diffMinutes / (24 * 60));
    latePenalty = Math.min(lateDays, 5);
    earned -= latePenalty;
    lateMinutes = diffMinutes;
  }

  earned = Math.max(0, earned); // never go below 0

  return {
    earned,
    basePoints: basePoints,
    earlyBonus,
    lateMinutes,
    latePenalty,
  };
}

// POST /api/trainee/tasks/:taskId/submit
// Body: { repoUrl, codeSnippet, notes }
async function submitTask(req, res) {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    if (task.type !== "training") {
      return res.status(400).json({ message: "Only training tasks can be submitted" });
    }

    // Find trainee by userId
    const trainee = await Trainee.findOne({ userId: req.user._id });
    if (!trainee || task.ownerId.toString() !== trainee._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Block submission if trainee is not in trial status
    if (trainee.status !== "trial") {
      const statusMessages = {
        paused: "Training is paused. Cannot submit tasks.",
        frozen: "Training is frozen. Cannot submit tasks.",
        cancelled: "Training has been cancelled. Cannot submit tasks.",
        withdraw_requested: "Withdrawal request pending. Cannot submit tasks.",
        withdrawn: "You have withdrawn from training. Cannot submit tasks.",
      };
      const message = statusMessages[trainee.status] || `Cannot submit during ${trainee.status} status.`;
      return res.status(403).json({ message });
    }

    // Submission payload
    const { repoUrl = "", codeSnippet = "", notes = "" } = req.body || {};
    if (!repoUrl && !codeSnippet) {
      return res.status(400).json({ message: "Provide at least a repository URL or code snippet" });
    }

    // Save submission
    const submittedAt = new Date();
    task.submission = { repoUrl, codeSnippet, notes, submittedAt };
    // Do NOT auto-evaluate. Leave for HR to rescore via AI.
    task.status = "submitted";

    const updated = await task.save();

    // Recompute trainee stats
    const allTasks = await Task.find({ type: "training", ownerId: trainee._id });
    const doneStatuses = ["completed", "reviewed"]; // treat reviewed as done
    const completed = allTasks.filter((t) => doneStatuses.includes(t.status)).length;
    const totalEarned = allTasks.reduce((sum, t) => sum + (t.earnedPoints || 0), 0);
    const totalRequired = allTasks.reduce((sum, t) => sum + (t.maxPoints || 0), 0);

    let onTime = 0, early = 0, late = 0;
    for (const t of allTasks) {
      if (doneStatuses.includes(t.status)) {
        if (t.scoringBreakdown?.earlyBonus > 0) early++;
        else if (t.scoringBreakdown?.latePenalty > 0) late++;
        else onTime++;
      }
    }

    await Trainee.findByIdAndUpdate(trainee._id, {
      completedTasksCount: completed,
      requiredTasksCount: allTasks.length,
      totalEarnedPoints: totalEarned,
      averagePointsPerTask: completed > 0 ? totalEarned / completed : 0,
      completionRate: allTasks.length > 0 ? Math.round((completed / allTasks.length) * 100) : 0,
      onTimeTasksCount: onTime,
      earlyTasksCount: early,
      lateTasksCount: late,
    });

    res.json({ task: updated, message: "Submission recorded. Awaiting HR review." });
  } catch (err) {
    console.error("submitTask error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/trainee/me/dashboard
async function getDashboard(req, res) {
  try {
    const trainee = await Trainee.findOne({ userId: req.user._id }).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    // Pull all training tasks for this trainee
    const tasks = await Task.find({ type: "training", ownerId: trainee._id }).sort({ updatedAt: -1 });

    const totalTasks = tasks.length;
    const reviewedTasks = tasks.filter((t) => ["reviewed", "completed"].includes(t.status));
    const submittedTasks = tasks.filter((t) => t.status === "submitted");
    const inProgressTasks = tasks.filter((t) => t.status === "in-progress");
    const pendingTasks = tasks.filter((t) => t.status === "pending");

    // Points
    const totalEarned = reviewedTasks.reduce((sum, t) => sum + (t.earnedPoints || 0), 0);
    const avgPerReviewed = reviewedTasks.length > 0 ? totalEarned / reviewedTasks.length : 0;
    const maxPossibleTotal = tasks.reduce((sum, t) => sum + (t.maxPoints || 0), 0);

    // Timing buckets
    let onTime = 0, early = 0, late = 0;
    for (const t of reviewedTasks) {
      const sb = t.scoringBreakdown || {};
      if ((sb.earlyBonus || 0) > 0) early++;
      else if ((sb.latePenalty || 0) > 0) late++;
      else onTime++;
    }

    // Recent activity: last 5 updates
    const recent = tasks.slice(0, 5).map((t) => ({
      taskId: t._id,
      title: t.title,
      status: ["completed"].includes(t.status) ? "reviewed" : t.status,
      earnedPoints: t.earnedPoints || 0,
      updatedAt: t.updatedAt || t.submission?.submittedAt || t.createdAt,
    }));

    const completionRate = totalTasks > 0 ? Math.round((reviewedTasks.length / totalTasks) * 100) : 0;

    res.json({
      trainee: {
        id: trainee._id,
        name: trainee.applicantId?.fullName || undefined,
        email: trainee.applicantId?.email || undefined,
        position: trainee.position,
        status: trainee.status,
      },
      totals: {
        totalTasks,
        reviewedTasks: reviewedTasks.length,
        submittedTasks: submittedTasks.length,
        inProgressTasks: inProgressTasks.length,
        pendingTasks: pendingTasks.length,
        completionRate,
      },
      points: {
        totalEarned: totalEarned,
        avgPerReviewed: avgPerReviewed,
        maxPossibleTotal,
      },
      timing: { onTime, early, late },
      recent,
    });
  } catch (err) {
    console.error("getDashboard error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// HR: Rescore a training task using its existing submission
async function hrRescoreTrainingTask(req, res) {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.type !== "training") return res.status(400).json({ message: "Not a training task" });
    if (!task.submission || (!task.submission.repoUrl && !task.submission.codeSnippet)) {
      return res.status(400).json({ message: "No submission found to rescore" });
    }

    const ai = ensureOpenAI();
    if (!ai) return res.status(503).json({ message: "OpenAI not configured" });

    const aiEval = await evaluateTrainingTaskSubmission(task.toObject(), task.submission);
    task.aiEvaluation = aiEval;
    // Apply timing bonuses/penalties on HR rescore
    const timing = computePointsWithTiming(aiEval.score, task.dueAt, task.submission?.submittedAt);
    task.earnedPoints = timing.earned;
    task.status = "reviewed"; // HR reviewed
    task.scoringBreakdown = {
      basePoints: timing.basePoints,
      earlyBonus: timing.earlyBonus,
      lateMinutes: timing.lateMinutes,
      latePenalty: timing.latePenalty,
    };
    const updated = await task.save();

    // Recompute trainee aggregates so dashboard reflects reviewed points
    const trainee = await Trainee.findById(task.ownerId);
    if (trainee) {
      const allTasks = await Task.find({ type: "training", ownerId: trainee._id });
      const doneStatuses = ["completed", "reviewed"]; // treat reviewed as done
      const completed = allTasks.filter((t) => doneStatuses.includes(t.status)).length;
      const totalEarned = allTasks.reduce((sum, t) => sum + (t.earnedPoints || 0), 0);
      let onTime = 0, early = 0, late = 0;
      for (const t of allTasks) {
        if (doneStatuses.includes(t.status)) {
          if (t.scoringBreakdown?.earlyBonus > 0) early++;
          else if (t.scoringBreakdown?.latePenalty > 0) late++;
          else onTime++;
        }
      }
      await Trainee.findByIdAndUpdate(trainee._id, {
        completedTasksCount: completed,
        requiredTasksCount: allTasks.length,
        totalEarnedPoints: totalEarned,
        averagePointsPerTask: completed > 0 ? totalEarned / completed : 0,
        completionRate: allTasks.length > 0 ? Math.round((completed / allTasks.length) * 100) : 0,
        onTimeTasksCount: onTime,
        earlyTasksCount: early,
        lateTasksCount: late,
      });
    }

    res.json({ task: updated });
  } catch (err) {
    console.error("hrRescoreTrainingTask error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// HR Update Task Points - Allow HR to manually adjust earned points
const hrUpdateTaskPoints = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { earnedPoints } = req.body;

    // Validate input
    if (earnedPoints === undefined || earnedPoints === null) {
      return res.status(400).json({ message: "earnedPoints is required" });
    }

    const points = parseInt(earnedPoints, 10);
    if (isNaN(points)) {
      return res.status(400).json({ message: "earnedPoints must be a valid number" });
    }

    if (points < 0) {
      return res.status(400).json({ message: "earnedPoints cannot be negative" });
    }

    // Find the task
    const Task = require("../models/Task");
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Validate points don't exceed maxPoints
    if (points > (task.maxPoints || 100)) {
      return res.status(400).json({
        message: `earnedPoints cannot exceed maxPoints (${task.maxPoints || 100})`,
      });
    }

    // Store previous value before updating
    const previousPoints = task.earnedPoints;

    // Update earnedPoints
    task.earnedPoints = points;
    task.manuallyAdjustedBy = req.user._id; // Track who made the adjustment
    task.manualAdjustmentDate = new Date(); // Track when it was adjusted
    task.manualAdjustmentPrevious = previousPoints; // Store previous value

    await task.save();

    res.json({ task });
  } catch (err) {
    console.error("hrUpdateTaskPoints error", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { submitTask, getDashboard, hrRescoreTrainingTask, hrUpdateTaskPoints };
