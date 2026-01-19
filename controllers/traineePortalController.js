const Task = require("../models/Task");
const Trainee = require("../models/Trainee");
const { sendTrainingSubmittedEmail } = require("../services/emailService");

// GET /api/trainee/me/tasks
// Returns training tasks for the logged-in trainee/user without HR-only fields
async function myTrainingTasks(req, res) {
  try {
    // Find trainee record by userId, if any
    const trainee = await Trainee.findOne({ userId: req.user._id });
    const traineeId = trainee?._id;

    // Find training tasks assigned to current user
    const query = { type: "training", assignedTo: req.user._id };
    if (traineeId) {
      query.ownerType = "trainee";
      query.ownerId = traineeId;
    }

    // Auto-expire if trainingEndAt passed and not submitted
    if (trainee && trainee.trainingEndAt && trainee.trainingStatus !== "submitted") {
      if (new Date(trainee.trainingEndAt).getTime() < Date.now() && trainee.trainingStatus !== "expired") {
        await Trainee.findByIdAndUpdate(trainee._id, { trainingStatus: "expired" });
        trainee.trainingStatus = "expired";
      }
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 }).lean();

    // Compute progress
      // Count both 'completed' and 'reviewed' as done for progress
      const completed = tasks.filter((t) => ["completed", "reviewed"].includes(t.status)).length;
    for (const t of tasks) {
      // remove HR-only fields from task output (but KEEP earnedPoints and maxPoints since trainee needs to see their score target)
      delete t.rubric;
      delete t.evaluationNotes;
      delete t.source;
    }
    const progress = {
      completed,
      total: tasks.length,
    };
    
    // Include trainee status for UI restrictions
    const traineeStatus = trainee ? {
      status: trainee.status,
      pausedReason: trainee.pausedReason,
      frozenReason: trainee.frozenReason,
      cancelReason: trainee.cancelReason,
      withdrawReason: trainee.withdrawReason,
      trainingStatus: trainee.trainingStatus,
      trainingSubmittedAt: trainee.trainingSubmittedAt,
      trainingEndAt: trainee.trainingEndAt,
    } : null;
    
    res.json({ tasks, progress, traineeStatus });
  } catch (err) {
    console.error("myTrainingTasks error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/trainee/me/submit-training
async function submitTraining(req, res) {
  try {
    console.log("[submitTraining] User ID:", req.user?._id, "Full user:", req.user);
    const trainee = await Trainee.findOne({ userId: req.user._id }).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    if (trainee.trainingStatus === "submitted") {
      return res.status(400).json({ message: "Training already submitted" });
    }

    await Trainee.findByIdAndUpdate(trainee._id, {
      trainingStatus: "submitted",
      trainingSubmittedAt: new Date(),
    });

    // Mark in-progress/pending training tasks as submitted (awaiting HR review)
    await Task.updateMany(
      { type: "training", ownerType: "trainee", ownerId: trainee._id, status: { $nin: ["completed", "reviewed"] } },
      { $set: { status: "submitted" } }
    );

    // Optional: send confirmation email
    try {
      const email = trainee.applicantId?.email;
      const name = trainee.applicantId?.fullName || "Trainee";
      if (email) await sendTrainingSubmittedEmail(email, name);
    } catch (e) {
      console.warn("submitTraining email failed", e.message);
    }

    res.json({ message: "Training submitted", trainingStatus: "submitted" });
  } catch (err) {
    console.error("submitTraining error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/trainee/:traineeId/reopen-training (HR only)
async function reopenTraining(req, res) {
  try {
    const trainee = await Trainee.findByIdAndUpdate(
      req.params.traineeId,
      {
        trainingStatus: "active",
        trainingSubmittedAt: null,
      },
      { new: true }
    );
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    res.json({ message: "Training reopened", trainingStatus: "active", trainee });
  } catch (err) {
    console.error("reopenTraining error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = { myTrainingTasks, submitTraining, reopenTraining };
