const Trainee = require("../models/Trainee");
const Applicant = require("../models/Applicant");
const Task = require("../models/Task");
const User = require("../models/User");
const { getJsonFromText, ensureOpenAI, MODEL } = require("../services/openaiClient");
const { sendTraineeCredentials } = require("../services/emailService");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
// POST /api/hr/trainees/:traineeId/link-user
async function linkUser(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.traineeId).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const email = trainee.applicantId?.email;
    const fullName = trainee.applicantId?.fullName || "Trainee";
    if (!email) return res.status(400).json({ message: "Applicant email missing" });

    let user = await User.findOne({ email });
    let tempPassword = null;
    if (!user) {
      // Use default temp password as requested
      tempPassword = "123456";
      user = await User.create({ fullName, email, password: tempPassword, role: "trainee" });
    } else {
      // ensure role is trainee if not admin
      if (user.role !== "admin") {
        tempPassword = "123456";
        user.role = "trainee";
        user.password = tempPassword; // reset to default so email matches
        await user.save();
      }
    }

    // link user to trainee
    await Trainee.findByIdAndUpdate(trainee._id, { userId: user._id });

    // assign existing training tasks to this user if owned by this trainee and unassigned
    await Task.updateMany(
      { type: "training", ownerType: "trainee", ownerId: trainee._id, assignedTo: { $ne: user._id } },
      { $addToSet: { assignedTo: user._id } }
    );

    // Send email with credentials
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const emailResult = await sendTraineeCredentials(email, fullName, tempPassword, appUrl);

    res.json({ 
      message: "Linked", 
      userId: user._id, 
      email, 
      tempPassword,
      emailSent: emailResult.success,
      emailMessage: emailResult.success ? "Credentials sent to email" : `Email failed: ${emailResult.error}`
    });
  } catch (err) {
    console.error("linkUser error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/hr/trainees
async function listTrainees(req, res) {
  try {
    const { status, search, skip = 0, limit = 50 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (search) {
      const regex = new RegExp(search, "i");
      q.$or = [
        { position: regex },
        { skillsSnapshot: { $elemMatch: { $regex: regex } } },
      ];
    }
    const trainees = await Trainee.find(q)
      .populate("applicantId", "fullName email position aiSummary")
      .populate("userId", "fullName email")
      .skip(Number(skip))
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const ids = trainees.map((t) => t._id);
    const taskAgg = await Task.aggregate([
      { $match: { type: "training", ownerType: "trainee", ownerId: { $in: ids } } },
      {
        $group: {
          _id: "$ownerId",
          totalTasks: { $sum: 1 },
          reviewedCount: {
            $sum: {
              $cond: [
                { $in: ["$status", ["reviewed", "completed"]] },
                1,
                0,
              ],
            },
          },
          reviewedEarned: {
            $sum: {
              $cond: [
                { $in: ["$status", ["reviewed", "completed"]] },
                { $ifNull: ["$earnedPoints", 0] },
                0,
              ],
            },
          },
          totalMaxPoints: { $sum: { $ifNull: ["$maxPoints", 0] } },
        },
      },
    ]);

    const aggMap = new Map();
    for (const row of taskAgg) {
      aggMap.set(String(row._id), row);
    }

    const data = trainees.map((t) => {
      const doc = t.toObject();
      const stats = aggMap.get(String(t._id)) || {};
      const totalTasks = stats.totalTasks || 0;
      const reviewed = stats.reviewedCount || 0;
      const completionRate = totalTasks > 0 ? Math.round((reviewed / totalTasks) * 100) : 0;
      const totalEarnedPoints = stats.reviewedEarned || 0;

      doc.reviewedTasksCount = reviewed;
      doc.totalTasksCount = totalTasks;
      doc.totalEarnedPoints = totalEarnedPoints;
      doc.completionRate = completionRate;
      // Preserve legacy fields for UI compatibility
      doc.completedTasksCount = reviewed;
      doc.requiredTasksCount = totalTasks;
      doc.score = totalEarnedPoints;
      return doc;
    });

    res.json(data);
  } catch (err) {
    console.error("listTrainees error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/hr/dashboard/trainees
// Returns leaderboard-ready trainee data with computed training metrics
async function getDashboardTrainees(req, res) {
  try {
    const trainees = await Trainee.find()
      .populate("applicantId", "fullName email position")
      .populate("userId", "fullName email role");

    const ids = trainees.map((t) => t._id);
    const taskAgg = await Task.aggregate([
      { $match: { type: "training", ownerType: "trainee", ownerId: { $in: ids } } },
      {
        $group: {
          _id: "$ownerId",
          totalTasks: { $sum: 1 },
          reviewedCount: {
            $sum: {
              $cond: [
                { $in: ["$status", ["reviewed", "completed"]] },
                1,
                0,
              ],
            },
          },
          reviewedEarned: {
            $sum: {
              $cond: [
                { $in: ["$status", ["reviewed", "completed"]] },
                { $ifNull: ["$earnedPoints", 0] },
                0,
              ],
            },
          },
          totalMaxPoints: { $sum: { $ifNull: ["$maxPoints", 0] } },
          early: {
            $sum: {
              $cond: [{ $gt: ["$scoringBreakdown.earlyBonus", 0] }, 1, 0],
            },
          },
          late: {
            $sum: {
              $cond: [{ $gt: ["$scoringBreakdown.latePenalty", 0] }, 1, 0],
            },
          },
          onTime: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", ["reviewed", "completed"]] },
                    { $eq: ["$scoringBreakdown.earlyBonus", 0] },
                    { $eq: ["$scoringBreakdown.latePenalty", 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const aggMap = new Map();
    for (const row of taskAgg) {
      aggMap.set(String(row._id), row);
    }

    const result = trainees.map((t) => {
      const stats = aggMap.get(String(t._id)) || {};
      const totalTasks = stats.totalTasks || 0;
      const reviewed = stats.reviewedCount || 0;
      const completionRate = totalTasks > 0 ? Math.round((reviewed / totalTasks) * 100) : 0;
      const totalEarnedPoints = stats.reviewedEarned || 0;
      const totalMaxPoints = stats.totalMaxPoints || 0;
      const normalizedPoints = totalMaxPoints > 0 ? Math.min(100, Math.round((totalEarnedPoints / totalMaxPoints) * 100)) : completionRate;
      // Suggested score: blend completion and normalized points, tweak by timing
      const timingBonus = Math.min(stats.early || 0, 3);
      const timingPenalty = Math.min(stats.late || 0, 5);
      let suggestedHrScore = Math.round(0.6 * completionRate + 0.4 * normalizedPoints + timingBonus - timingPenalty);
      suggestedHrScore = Math.max(0, Math.min(100, suggestedHrScore));

      let suggestedDecision = "needs_improvement";
      if (completionRate >= 90 && suggestedHrScore >= 95) {
        suggestedDecision = "ready_to_promote";
      } else if (suggestedHrScore >= 80) {
        suggestedDecision = completionRate >= 70 ? "part_time_candidate" : "needs_improvement";
      }

      const suggestedNotes = `Completed ${reviewed}/${totalTasks} tasks, Earned ${totalEarnedPoints} pts, On-time: ${stats.onTime || 0}, Early: ${stats.early || 0}, Late: ${stats.late || 0}`;
      const displayName =
        t.applicantId?.fullName ||
        t.userId?.fullName ||
        t.applicantId?.email ||
        t.userId?.email ||
        "Unknown";
      const email = t.applicantId?.email || t.userId?.email || "";

      return {
        traineeId: t._id,
        displayName,
        email,
        position: t.position,
        status: t.status,
        computedTrainingScore: totalEarnedPoints,
        progress: {
          reviewed,
          total: totalTasks,
          completionRate,
        },
        timing: {
          onTime: stats.onTime || 0,
          early: stats.early || 0,
          late: stats.late || 0,
        },
        hrFinalScore: t.hrFinalScore,
        hrDecision: t.hrDecision,
        hrNotes: t.hrNotes,
        evaluatedAt: t.evaluatedAt,
        evaluatedBy: t.evaluatedBy,
        suggestedHrScore,
        suggestedDecision,
        suggestedNotes,
        totalEarnedPoints,
        totalMaxPoints,
        linkedUserId: t.userId?._id,
        linkedUserRole: t.userId?.role,
      };
    });

    // Sort by computed training score desc as default
    result.sort((a, b) => (b.computedTrainingScore || 0) - (a.computedTrainingScore || 0));

    res.json(result);
  } catch (err) {
    console.error("getDashboardTrainees error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/hr/trainees/from-applicant/:applicantId
async function createFromApplicant(req, res) {
  try {
    const applicant = await Applicant.findById(req.params.applicantId);
    if (!applicant) return res.status(404).json({ message: "Applicant not found" });

    // Prevent creating more than one trainee for the same applicant
    const existing = await Trainee.findOne({ applicantId: applicant._id });
    if (existing) {
      // Revive cancelled/withdrawn/frozen/paused trainees back to trial
      existing.status = "trial";
      existing.pausedAt = null;
      existing.pauseUntil = null;
      existing.pausedReason = "";
      existing.pausedBy = null;
      existing.frozenAt = null;
      existing.freezeUntil = null;
      existing.frozenReason = "";
      existing.frozenBy = null;
      existing.cancelledAt = null;
      existing.cancelReason = "";
      existing.cancelledBy = null;
      existing.withdrawRequestedAt = null;
      existing.withdrawReason = "";
      existing.withdrawnAt = null;
      existing.withdrawnBy = null;
      existing.statusUpdatedAt = new Date();
      await existing.save();
      await Applicant.findByIdAndUpdate(applicant._id, { traineeId: existing._id, stage: "Hired" });
      return res.status(200).json({ message: "Trainee revived", traineeId: existing._id, trainee: existing });
    }

    const skills = Array.isArray(applicant.aiSummary?.top_skills)
      ? applicant.aiSummary.top_skills
      : [];

    const trainee = await Trainee.create({
      applicantId: applicant._id,
      position: applicant.position || "",
      skillsSnapshot: skills,
      status: "trial",
    });

    await Applicant.findByIdAndUpdate(applicant._id, { stage: "Accepted", traineeId: trainee._id });

    res.status(201).json(trainee);
  } catch (err) {
    console.error("createFromApplicant error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// Helper: build system prompt for AI tasks
function buildTaskPrompt(position, skills) {
  return `You are HR assistant. Generate STRICT JSON ONLY in the following shape:\n{
    "tasks": [
      {
        "title": "string",
        "description": "string",
        "difficulty": "easy|medium|hard",
        "requirements": ["explicit checklist item"],
        "rubric": [ { "criterion": "string", "maxPoints": number, "keywords": ["optional"] } ],
        "maxPoints": number,
        "dueDays": 7
      }
    ]
  }\nRules:\n- Ensure maxPoints equals the sum of rubric maxPoints.\n- Prefer 5-8 tasks for position "${position}" using skills: ${skills.join(", ")}.`;
}

// POST /api/hr/trainees/:traineeId/generate-tasks (AI or PDF)
async function generateTasks(req, res) {
  try {
    const { mode = "ai" } = req.body;
    const trainee = await Trainee.findById(req.params.traineeId).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    // Replace behavior
    const existingTasks = await Task.find({ type: "training", ownerType: "trainee", ownerId: trainee._id });
    const replace = (req.query.replace || req.body.replace) === "true" || req.body.replace === true;
    if (existingTasks.length > 0 && !replace) {
      return res.status(409).json({ message: "Tasks already exist. Set replace=true to overwrite.", existing: existingTasks.length });
    }

    let tasksPayload = null;

    if (mode === "ai") {
      const position = trainee.position || trainee.applicantId?.position || "";
      const skills = trainee.skillsSnapshot || [];
      const systemPrompt = buildTaskPrompt(position, skills);
      let raw;
      try {
        raw = await getJsonFromText(systemPrompt, `Create tasks`);
      } catch (err) {
        if (err?.code === "OPENAI_NOT_CONFIGURED") return res.status(503).json({ message: "OpenAI not configured" });
        throw err;
      }
      try {
        tasksPayload = typeof raw === "object" ? raw : JSON.parse(raw);
      } catch (e) {
        return res.status(400).json({ message: "Invalid AI JSON response" });
      }
    } else if (mode === "pdf") {
      if (!req.file) return res.status(400).json({ message: "No PDF uploaded" });
      const pdfPath = path.join(__dirname, "..", "uploads", "training", req.file.filename);
      const buffer = fs.readFileSync(pdfPath);
      const parsed = await pdfParse(buffer);
      const text = parsed?.text || "";
      // naive split lines into tasks: Title - Description - Points
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const tasks = [];
      for (const line of lines) {
        const m = line.match(/^(.{5,80})\s+-\s+(.{10,200})/);
        if (m) {
          tasks.push({ title: m[1], description: m[2], difficulty: "medium", maxPoints: 10, tags: [], dueDays: 7 });
        }
      }
      tasksPayload = { tasks };
    } else {
      return res.status(400).json({ message: "Invalid mode" });
    }

    const tasks = Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [];
    if (!tasks.length) return res.status(400).json({ message: "No tasks generated" });

    // Prepare docs to insert
    const docs = tasks.map((t) => {
      const dueDate = new Date(Date.now() + (Number(t.dueDays) || 7) * 24 * 60 * 60 * 1000);
      const maxPoints = Number(t.maxPoints) || 10;
      return {
        title: t.title,
        description: t.description,
        priority: t.difficulty === "hard" ? "high" : t.difficulty === "easy" ? "low" : "medium",
        status: "pending",
        dueDate,
        assignedTo: trainee.userId ? [trainee.userId] : [],
        createdBy: req.user._id,
        checklist: [],
        attachments: [],
        type: "training",
        ownerType: "trainee",
        ownerId: trainee._id,
        requirements: Array.isArray(t.requirements) ? t.requirements : [],
        rubricItems: Array.isArray(t.rubric) ? t.rubric.map((r) => ({ criterion: r.criterion, maxPoints: Number(r.maxPoints)||0, keywords: Array.isArray(r.keywords)?r.keywords:[] })) : [],
        maxPoints,
        earnedPoints: 0,
        source: mode,
      };
    });

    let created = [];
    if (replace && existingTasks.length > 0) {
      await Task.deleteMany({ type: "training", ownerType: "trainee", ownerId: trainee._id });
      created = await Task.insertMany(docs);
    } else {
      created = await Task.insertMany(docs);
    }

    // Update trainee required count
    await Trainee.findByIdAndUpdate(trainee._id, { requiredTasksCount: created.length });

    res.status(201).json({ tasks: created });
  } catch (err) {
    console.error("generateTasks error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/hr/trainees/:traineeId/tasks
async function getTraineeTasks(req, res) {
  try {
    const tasks = await Task.find({ type: "training", ownerType: "trainee", ownerId: req.params.traineeId })
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error("getTraineeTasks error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:traineeId/score
async function evaluateTrainee(req, res) {
  try {
    const { score, notes } = req.body;
    const s = Math.max(0, Math.min(100, Number(score) || 0));

    // recompute completed tasks count
    const completed = await Task.countDocuments({ type: "training", ownerType: "trainee", ownerId: req.params.traineeId, status: "completed" });

    // status thresholds
    let nextStatus = "needs_improvement";
    if (s > 95) nextStatus = "eligible_for_promotion";
    else if (s >= 80) nextStatus = "part_time_candidate";

    const trainee = await Trainee.findByIdAndUpdate(
      req.params.traineeId,
      {
        score: s,
        completedTasksCount: completed,
        status: nextStatus,
        hrEvaluationNotes: (notes || "").toString(),
      },
      { new: true }
    );

    if (!trainee) return res.status(404).json({ message: "Trainee not found" });
    res.json(trainee);
  } catch (err) {
    console.error("updateScore error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PUT /api/hr/trainees/:traineeId/evaluation
async function saveHrEvaluation(req, res) {
  try {
    const traineeId = req.params.traineeId || req.params.id;
    const { hrFinalScore, hrDecision, hrNotes } = req.body || {};

    const score = Number(hrFinalScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ message: "hrFinalScore must be between 0 and 100" });
    }

    const allowedDecisions = [
      "trial",
      "needs_improvement",
      "part_time",
      "part_time_candidate",
      "ready_to_promote",
      "eligible_for_promotion",
      "promoted",
      "rejected",
    ];
    if (hrDecision && !allowedDecisions.includes(hrDecision)) {
      return res.status(400).json({ message: "Invalid hrDecision" });
    }

    const statusMap = {
      trial: "trial",
      needs_improvement: "needs_improvement",
      part_time: "part_time_candidate",
      part_time_candidate: "part_time_candidate",
      ready_to_promote: "eligible_for_promotion",
      eligible_for_promotion: "eligible_for_promotion",
      promoted: "promoted",
      rejected: "rejected",
    };

    const update = {
      hrFinalScore: score,
      hrDecision: hrDecision || null,
      hrNotes: (hrNotes || "").toString(),
      evaluatedAt: new Date(),
      evaluatedBy: req.user._id,
      hrScore: score, // keep legacy field in sync
    };

    if (hrDecision && statusMap[hrDecision]) {
      update.status = statusMap[hrDecision];
    }

    const trainee = await Trainee.findByIdAndUpdate(traineeId, update, { new: true });
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });
    res.json(trainee);
  } catch (err) {
    console.error("saveHrEvaluation error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/hr/trainees/:traineeId/promote
async function promoteTrainee(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.traineeId).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const completionRate = trainee.completionRate || 0;
    const finalScore = trainee.hrFinalScore || 0;
    const eligible = trainee.hrDecision === "ready_to_promote" || (finalScore >= 95 && completionRate >= 80) || trainee.status === "eligible_for_promotion";
    if (!eligible) {
      return res.status(400).json({ message: "Trainee not eligible for promotion" });
    }

    // create or update a User with role 'trainee' -> 'user'
    let user = null;
    if (trainee.userId) {
      user = await User.findByIdAndUpdate(trainee.userId, { role: "user" }, { new: true });
    }
    if (!user) {
      // try existing user by email
      user = await User.findOne({ email: trainee.applicantId.email });
      if (user) {
        user.role = "user";
        await user.save();
      } else {
        // create a new enabled employee user with random password
        const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).toUpperCase().slice(2);
        user = await User.create({
          fullName: trainee.applicantId.fullName,
          email: trainee.applicantId.email,
          password: randomPass,
          role: "user",
        });
      }
      // link back to trainee
      await Trainee.findByIdAndUpdate(trainee._id, { userId: user._id });
    }

    await Trainee.findByIdAndUpdate(trainee._id, { status: "promoted", hrDecision: "promoted", promotedAt: new Date() });
    await Applicant.findByIdAndUpdate(trainee.applicantId._id, { stage: "Hired" });

    res.json({ message: "Trainee promoted", traineeId: trainee._id, userId: user?._id });
  } catch (err) {
    console.error("promoteTrainee error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/hr/trainees/stats
async function traineeStats(req, res) {
  try {
    const statuses = [
      "trial",
      "needs_improvement",
      "part_time_candidate",
      "eligible_for_promotion",
      "promoted",
      "rejected",
    ];
    const counts = {};
    for (const s of statuses) {
      counts[s] = await Trainee.countDocuments({ status: s });
    }
    const ready = counts["eligible_for_promotion"] || 0;
    res.json({ counts, ready });
  } catch (err) {
    console.error("traineeStats error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// DELETE /api/hr/trainees/:id/revert-to-hired
async function revertToHired(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    // Remove traineeId from applicant but keep stage as "Hired"
    if (trainee.applicantId) {
      await Applicant.findByIdAndUpdate(trainee.applicantId, { traineeId: null, stage: "Hired" });
    }

    // Delete all training tasks for this trainee
    await Task.deleteMany({ type: "training", ownerType: "trainee", ownerId: trainee._id });

    // Delete the trainee record
    await Trainee.findByIdAndDelete(trainee._id);

    res.json({ message: "Trainee reverted to Hired Applicant status" });
  } catch (err) {
    console.error("revertToHired error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  listTrainees,
  getDashboardTrainees,
  createFromApplicant,
  generateTasks,
  getTraineeTasks,
  evaluateTrainee,
  saveHrEvaluation,
  promoteTrainee,
  traineeStats,
  linkUser,
  revertToHired,
};

// POST /api/hr/trainees/:traineeId/tasks/:taskId/rescore
// HR can re-run AI evaluation for a submitted or pending training task
async function hrRescoreTask(req, res) {
  try {
    const traineeId = req.params.traineeId;
    const taskId = req.params.taskId;
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (String(task.ownerId) !== String(traineeId) || task.type !== "training") {
      return res.status(403).json({ message: "Task not owned by trainee" });
    }

    const { repoUrl = "", code = "", notes = "" } = req.body || {};

    // Run AI evaluation
    let aiScore = Number(task.maxPoints || 0);
    let aiFeedback = "";
    let aiChecks = [];
    try {
      const systemPrompt = `You are a strict code evaluator. Return STRICT JSON ONLY with keys: {"score": number(0..${aiScore}), "feedback": string, "checks": [{"name": string, "pass": boolean, "details": string}]}. Assess submission against the task description and best practices.`;
      const userText = `Task: ${task.title}\nDescription: ${task.description}\nRubric: ${task.rubric || ""}\nRepoURL: ${repoUrl}\nCodeSnippet:\n${(code || "").slice(0, 12000)}`;
      const raw = await getJsonFromText(systemPrompt, userText);
      const parsed = typeof raw === "object" ? raw : JSON.parse(raw);
      if (typeof parsed?.score === "number") {
        aiScore = Math.max(0, Math.min(task.maxPoints || 0, Math.round(parsed.score)));
      }
      aiFeedback = (parsed?.feedback || "").toString();
      aiChecks = Array.isArray(parsed?.checks) ? parsed.checks : [];
    } catch (e) {
      aiFeedback = aiFeedback || "AI evaluation unavailable. Using base score.";
    }

    // If already submitted, preserve submittedAt for timing; otherwise don't apply timing
    const submittedAt = task.submittedAt || null;
    let earned = aiScore;
    let scoringBreakdown = {
      basePoints: aiScore,
      earlyBonus: 0,
      lateMinutes: 0,
      latePenalty: 0,
    };
    if (submittedAt) {
      const dueAt = task.dueAt;
      const dueTime = dueAt ? new Date(dueAt).getTime() : null;
      const subTime = new Date(submittedAt).getTime();
      let earlyBonus = 0, latePenalty = 0, lateMinutes = 0;
      if (dueTime) {
        const diffMinutes = Math.round((subTime - dueTime) / 60000);
        if (diffMinutes < 0) {
          const earlyDays = Math.floor(Math.abs(diffMinutes) / (24 * 60));
          earlyBonus = Math.min(earlyDays, 3);
        } else if (diffMinutes > 0) {
          const lateDays = Math.floor(diffMinutes / (24 * 60));
          latePenalty = Math.min(lateDays, 5);
          lateMinutes = diffMinutes;
        }
      }
      earned = Math.max(0, aiScore + earlyBonus - latePenalty);
      scoringBreakdown = { basePoints: aiScore, earlyBonus, lateMinutes, latePenalty };
    }

    const updated = await Task.findByIdAndUpdate(
      taskId,
      {
        earnedPoints: earned,
        scoringBreakdown,
        evaluationNotes: JSON.stringify({ repoUrl, notes, aiFeedback, aiChecks, aiScore, rescoredBy: "HR" }),
      },
      { new: true }
    );

    res.json({ task: updated, points: earned, breakdown: scoringBreakdown });
  } catch (err) {
    console.error("hrRescoreTask error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// GET /api/hr/ai/status
async function getAiStatus(req, res) {
  try {
    const client = ensureOpenAI();
    const configured = !!client;
    res.json({ configured, model: MODEL });
  } catch (err) {
    res.json({ configured: false, model: MODEL });
  }
}

module.exports.hrRescoreTask = hrRescoreTask;
module.exports.getAiStatus = getAiStatus;
