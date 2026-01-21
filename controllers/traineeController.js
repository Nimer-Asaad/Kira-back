const Trainee = require("../models/Trainee");
const Applicant = require("../models/Applicant");
const Task = require("../models/Task");
const User = require("../models/User");
const { getJsonFromText, ensureOpenAI, MODEL } = require("../services/openaiClient");
const { sendTraineeCredentials, sendHiringEmail, sendUserCredentials, sendUserRoleUpdate } = require("../services/emailService");
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
    console.error("listTrainees error:", err.message || err);
    res.status(500).json({ message: "Server error", error: err.message });
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
  return `You are an HR training program designer. Generate a training task list for a trainee.

**Specialization**: ${position}
**Skills**: ${skills.join(", ")}

**CRITICAL REQUIREMENTS**:
1. Generate EXACTLY 5-8 tasks
2. TOTAL SUM of points across ALL tasks MUST be EXACTLY 100 points
3. Tasks MUST be specifically tailored to the "${position}" role
4. Tasks MUST incorporate the provided skills

**Point Distribution Guidelines**:
- Easy tasks: 5-10 points each
- Medium tasks: 10-20 points each  
- Hard tasks: 20-30 points each
- Ensure the sum equals EXACTLY 100

**Output Format** - Return ONLY valid JSON in this exact structure:
{
  "tasks": [
    {
      "title": "Task title specific to ${position}",
      "description": "Detailed description with clear objectives",
      "difficulty": "easy|medium|hard",
      "requirements": ["Specific deliverable 1", "Specific deliverable 2"],
      "rubric": [
        {
          "criterion": "Evaluation criterion",
          "maxPoints": 5,
          "keywords": ["keyword1", "keyword2"]
        }
      ],
      "maxPoints": 15,
      "dueDays": 7
    }
  ]
}

**Validation Rules**:
- Each task's maxPoints MUST equal the sum of its rubric items' maxPoints
- The sum of ALL tasks' maxPoints MUST equal EXACTLY 100
- All tasks must be relevant to ${position} specialization
- Return ONLY the JSON object, no additional text`;
}

// Normalize tasks: ensure non-negative points, rubric consistency, and total points = 100
function sanitizeGeneratedTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : [];
  if (!list.length) return [];

  for (const t of list) {
    // normalize difficulty
    const d = (t.difficulty || 'medium').toLowerCase();
    t.difficulty = ['easy', 'medium', 'hard'].includes(d) ? d : 'medium';

    // normalize maxPoints
    let mp = Number(t.maxPoints);
    if (!Number.isFinite(mp)) mp = 0;
    if (mp < 0) mp = 0;

    // normalize rubric and sync sum to maxPoints
    if (Array.isArray(t.rubric) && t.rubric.length) {
      t.rubric = t.rubric.map((r) => ({
        criterion: r?.criterion ? String(r.criterion) : 'Quality and completeness',
        maxPoints: Math.max(0, Number(r?.maxPoints) || 0),
        keywords: Array.isArray(r?.keywords) ? r.keywords : []
      }));
      const sum = t.rubric.reduce((s, r) => s + (Number(r.maxPoints) || 0), 0);
      if (sum !== mp) {
        const delta = mp - sum;
        t.rubric[t.rubric.length - 1].maxPoints = Math.max(0, (Number(t.rubric[t.rubric.length - 1].maxPoints) || 0) + delta);
      }
    } else {
      t.rubric = [{ criterion: 'Quality and completeness', maxPoints: mp, keywords: [] }];
    }

    t.maxPoints = mp;
    if (!Array.isArray(t.requirements)) t.requirements = [];
    if (typeof t.dueDays === 'undefined') t.dueDays = 7;
  }

  // enforce total = 100 by adjusting last task
  const total = list.reduce((s, t) => s + (Number(t.maxPoints) || 0), 0);
  const delta = 100 - total;
  if (delta !== 0) {
    const last = list[list.length - 1];
    last.maxPoints = Math.max(0, (Number(last.maxPoints) || 0) + delta);
    if (Array.isArray(last.rubric) && last.rubric.length) {
      last.rubric[last.rubric.length - 1].maxPoints = Math.max(0, (Number(last.rubric[last.rubric.length - 1].maxPoints) || 0) + delta);
    } else {
      last.rubric = [{ criterion: 'Quality and completeness', maxPoints: last.maxPoints, keywords: [] }];
    }
  }

  return list;
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

      // Sanitize generated tasks to guarantee valid points and total=100
      const aiTasks = Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [];
      tasksPayload = { tasks: sanitizeGeneratedTasks(aiTasks) };
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
      tasksPayload = { tasks: sanitizeGeneratedTasks(tasks) };
    } else {
      return res.status(400).json({ message: "Invalid mode" });
    }

    const tasks = Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [];
    if (!tasks.length) return res.status(400).json({ message: "No tasks generated" });

    // Prepare docs to insert
    const docs = tasks.map((t) => {
      const dueDate = new Date(Date.now() + (Number(t.dueDays) || 7) * 24 * 60 * 60 * 1000);
      const maxPoints = Math.max(0, Number(t.maxPoints) || 0);
      return {
        title: t.title,
        description: t.description,
        priority: t.difficulty === "hard" ? "high" : t.difficulty === "easy" ? "low" : "medium",
        status: "pending",
        dueDate,
        assignedTo: trainee.userId || null,
        createdBy: req.user._id,
        checklist: [],
        attachments: [],
        type: "training",
        ownerType: "trainee",
        ownerId: trainee._id,
        requirements: Array.isArray(t.requirements) ? t.requirements : [],
        rubricItems: Array.isArray(t.rubric) ? t.rubric.map((r) => ({ criterion: r.criterion, maxPoints: Number(r.maxPoints) || 0, keywords: Array.isArray(r.keywords) ? r.keywords : [] })) : [],
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

    // Update trainee required count AND reset trainingStatus to active if it was submitted
    const updateData = { requiredTasksCount: created.length };
    if (trainee.trainingStatus === "submitted" || trainee.trainingStatus === "expired") {
      updateData.trainingStatus = "active";
      updateData.trainingSubmittedAt = null;
    }
    await Trainee.findByIdAndUpdate(trainee._id, updateData);

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

    // Gate: allow only if training submitted or expired (or not set)
    const current = await Trainee.findById(traineeId);
    if (!current) return res.status(404).json({ message: "Trainee not found" });
    const statusOk = ["submitted", "expired", undefined, null].includes(current.trainingStatus);
    if (!statusOk && current.trainingStatus !== undefined) {
      return res.status(400).json({ message: "Evaluation allowed only after trainee submits or training expires" });
    }

    const trainee = await Trainee.findByIdAndUpdate(traineeId, update, { new: true });
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    // Auto-rescore all submitted tasks when HR saves evaluation
    const { ensureOpenAI } = require("../services/openaiClient");
    const { evaluateTrainingTaskSubmission } = require("../services/trainingEval");
    const ai = ensureOpenAI();
    if (ai) {
      try {
        const submittedTasks = await Task.find({
          type: "training",
          ownerType: "trainee",
          ownerId: trainee._id,
          status: "submitted"
        });

        for (const task of submittedTasks) {
          if (task.submission && (task.submission.repoUrl || task.submission.codeSnippet)) {
            try {
              // Evaluate with AI
              const aiEval = await evaluateTrainingTaskSubmission(task.toObject(), task.submission);
              task.aiEvaluation = aiEval;

              // Compute timing bonuses/penalties
              function computePointsWithTiming(basePoints, dueAt, submittedAt) {
                if (!dueAt || !submittedAt) {
                  return { earned: basePoints, basePoints, earlyBonus: 0, lateMinutes: 0, latePenalty: 0 };
                }
                const dueTime = new Date(dueAt).getTime();
                const subTime = new Date(submittedAt).getTime();
                const diffMs = subTime - dueTime;
                const diffMinutes = Math.round(diffMs / 60000);
                let earned = basePoints;
                let earlyBonus = 0, latePenalty = 0, lateMinutes = 0;
                if (diffMinutes < 0) {
                  const earlyDays = Math.floor(Math.abs(diffMinutes) / (24 * 60));
                  earlyBonus = Math.min(earlyDays, 3);
                  earned += earlyBonus;
                } else if (diffMinutes > 0) {
                  const lateDays = Math.floor(diffMinutes / (24 * 60));
                  latePenalty = Math.min(lateDays, 5);
                  earned -= latePenalty;
                  lateMinutes = diffMinutes;
                }
                earned = Math.max(0, earned);
                return { earned, basePoints, earlyBonus, lateMinutes, latePenalty };
              }

              const timing = computePointsWithTiming(aiEval.score, task.dueAt, task.submission?.submittedAt);
              task.earnedPoints = timing.earned;
              task.status = "reviewed";
              task.scoringBreakdown = {
                basePoints: timing.basePoints,
                earlyBonus: timing.earlyBonus,
                lateMinutes: timing.lateMinutes,
                latePenalty: timing.latePenalty,
              };
              await task.save();
            } catch (taskErr) {
              console.error(`Failed to auto-rescore task ${task._id}:`, taskErr);
              // Continue with other tasks even if one fails
            }
          }
        }

        // Recompute trainee aggregates
        const allTasks = await Task.find({ type: "training", ownerId: trainee._id });
        const doneStatuses = ["completed", "reviewed"];
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
      } catch (rescoreErr) {
        console.error("Auto-rescore error:", rescoreErr);
        // Don't fail the evaluation if auto-rescore fails
      }
    }

    res.json(trainee);
  } catch (err) {
    console.error("saveHrEvaluation error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/hr/trainees/:traineeId/promote
async function promoteTrainee(req, res) {
  try {
    const { traineeId } = req.params;
    const { employmentType } = req.body; // 'full_time' or 'part_time'

    if (!traineeId) {
      return res.status(400).json({ message: "Trainee ID is required" });
    }

    const trainee = await Trainee.findById(traineeId).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });
    if (!trainee.applicantId) return res.status(400).json({ message: "Trainee has no applicant info" });

    const completionRate = trainee.completionRate || 0;
    const finalScore = trainee.hrFinalScore || 0;
    const eligible = trainee.hrDecision === "ready_to_promote" || (finalScore >= 95 && completionRate >= 80) || trainee.status === "eligible_for_promotion";
    if (!eligible) {
      return res.status(400).json({ message: "Trainee not eligible for promotion" });
    }

    // Determine role based on employmentType or decision
    let newRole = "user";
    if (employmentType === "part_time" || trainee.hrDecision === "part_time_candidate") {
      newRole = "part_time";
    }

    // create or update a User
    let user = null;

    try {
      if (trainee.userId) {
        // Update existing user - preserve existing data but update role
        user = await User.findByIdAndUpdate(trainee.userId, { role: newRole }, { new: true });
      }

      if (!user) {
        // try existing user by email
        user = await User.findOne({ email: trainee.applicantId.email });
        if (user) {
          user.role = newRole;

          // Update user profile with applicant data if not already set
          if (!user.position && trainee.applicantId.position) {
            user.position = trainee.applicantId.position;
          }

          // Map position to specialization
          if (!user.specialization || user.specialization === "General") {
            const position = trainee.applicantId.position || trainee.position;
            if (position) {
              const posLower = position.toLowerCase();
              if (posLower.includes("frontend") || posLower.includes("react") || posLower.includes("vue")) {
                user.specialization = "Frontend";
              } else if (posLower.includes("backend") || posLower.includes("node") || posLower.includes("api")) {
                user.specialization = "Backend";
              } else if (posLower.includes("ai") || posLower.includes("ml")) {
                user.specialization = "AI";
              } else if (posLower.includes("qa") || posLower.includes("test")) {
                user.specialization = "QA";
              } else if (posLower.includes("devops") || posLower.includes("cloud")) {
                user.specialization = "DevOps";
              } else if (posLower.includes("ui") || posLower.includes("ux") || posLower.includes("design")) {
                user.specialization = "UI/UX";
              }
            }
          }

          // Extract skills from AI summary if available
          if (trainee.applicantId.aiSummary && trainee.applicantId.aiSummary.skills) {
            if (Array.isArray(trainee.applicantId.aiSummary.skills) && (!user.skills || user.skills.length === 0)) {
              user.skills = trainee.applicantId.aiSummary.skills.slice(0, 10).map((skill) => {
                return {
                  name: typeof skill === "string" ? skill : (skill?.name || "Unknown"),
                  level: 3
                };
              });
            }
          }

          await user.save();
        } else {
          // create a new enabled employee user with random password
          const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).toUpperCase().slice(2);

          const position = trainee.applicantId.position || trainee.position || "";
          let specialization = "General";

          if (position) {
            const posLower = position.toLowerCase();
            if (posLower.includes("frontend") || posLower.includes("react") || posLower.includes("vue")) {
              specialization = "Frontend";
            } else if (posLower.includes("backend") || posLower.includes("node") || posLower.includes("api")) {
              specialization = "Backend";
            } else if (posLower.includes("ai") || posLower.includes("ml")) {
              specialization = "AI";
            } else if (posLower.includes("qa") || posLower.includes("test")) {
              specialization = "QA";
            } else if (posLower.includes("devops") || posLower.includes("cloud")) {
              specialization = "DevOps";
            } else if (posLower.includes("ui") || posLower.includes("ux") || posLower.includes("design")) {
              specialization = "UI/UX";
            }
          }

          let skills = [];
          if (trainee.applicantId.aiSummary && trainee.applicantId.aiSummary.skills && Array.isArray(trainee.applicantId.aiSummary.skills)) {
            skills = trainee.applicantId.aiSummary.skills.slice(0, 10).map((skill) => {
              return {
                name: typeof skill === "string" ? skill : (skill?.name || "Unknown"),
                level: 3
              };
            });
          }

          user = await User.create({
            fullName: trainee.applicantId.fullName,
            email: trainee.applicantId.email,
            password: randomPass,
            role: newRole,
            position: position,
            specialization: specialization,
            skills: skills
          });
          user.wasNew = true;
          user.rawPassword = randomPass;
        }
      }

      // link back to trainee
      if (user && !trainee.userId) {
        await Trainee.findByIdAndUpdate(trainee._id, { userId: user._id });
      }
    } catch (userErr) {
      console.error("Error creating/updating user:", userErr.message);
      throw userErr;
    }

    // Update trainee status
    await Trainee.findByIdAndUpdate(trainee._id, { status: "promoted", hrDecision: "promoted", promotedAt: new Date() });
    await Applicant.findByIdAndUpdate(trainee.applicantId._id, { stage: "Hired" });

    // Send notification email
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    if (user && user.wasNew) {
      sendUserCredentials(user.email, user.fullName, user.rawPassword, newRole, appUrl)
        .catch(err => console.error("Failed to send promotion credentials email:", err));
    } else if (user) {
      sendUserRoleUpdate(user.email, user.fullName, newRole, appUrl)
        .catch(err => console.error("Failed to send promotion role update email:", err));
    }

    res.json({ message: "Trainee promoted", traineeId: trainee._id, userId: user?._id, role: newRole });
  } catch (err) {
    console.error("promoteTrainee error:", err.message || err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

// POST /api/hr/trainees/:traineeId/archive
async function archiveTrainee(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.traineeId).populate("applicantId");
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    await Trainee.findByIdAndUpdate(trainee._id, { status: "archived" });
    if (trainee.applicantId) {
      await Applicant.findByIdAndUpdate(trainee.applicantId._id, { stage: "Rejected" });
    }

    res.json({ message: "Candidate archived" });
  } catch (err) {
    console.error("archiveTrainee error", err);
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
  archiveTrainee,
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
      const systemPrompt = `You are a strict but fair code evaluator. Return STRICT JSON ONLY with keys: {
        "score": number(0..${aiScore}), 
        "feedback": string, 
        "deductionJustification": string,
        "checks": [{"name": string, "pass": boolean, "details": string}]
      }. Assess submission against the task description and best practices. In "deductionJustification", explain EXACTLY why points were lost (if any). Be technical and specific.`;
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
        evaluationNotes: JSON.stringify({
          repoUrl,
          notes,
          aiFeedback,
          aiChecks,
          aiScore,
          deductionJustification: parsed?.deductionJustification || "",
          rescoredBy: "HR"
        }),
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
