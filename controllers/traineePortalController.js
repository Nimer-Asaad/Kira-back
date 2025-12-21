const Task = require("../models/Task");
const Trainee = require("../models/Trainee");

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
      withdrawReason: trainee.withdrawReason
    } : null;
    
    res.json({ tasks, progress, traineeStatus });
  } catch (err) {
    console.error("myTrainingTasks error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = { myTrainingTasks };
