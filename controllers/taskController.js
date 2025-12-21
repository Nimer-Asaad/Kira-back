const Task = require("../models/Task");
const Admin = require("../models/Admin");
const User = require("../models/User");
const { parsePdfTasks, normalizeTitle } = require("../services/pdfParsingService");
const { autoDistributeTasks } = require("../services/taskDistributionService");

// Safely parse JSON strings coming from forms
const parseMaybeJSON = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
};

// @desc    Create new task (admin only)
// @route   POST /api/tasks
// @access  Private/Admin
const createTask = async (req, res) => {
  try {
    const body = req.body || {};
    const checklist = parseMaybeJSON(body.checklist) || [];
    const attachments = parseMaybeJSON(body.attachments) || [];

    const task = await Task.create({
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status || "pending",
      dueDate: body.dueDate,
      assignedTo: body.assignedTo,
      createdBy: req.user._id,
      checklist,
      attachments,
      ownerType: body.ownerType || "employee",
    });

    // Add task to admin's createdTasks array
    await Admin.findByIdAndUpdate(req.user._id, {
      $push: { createdTasks: task._id },
    });

    const populated = await Task.findById(task._id)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email");

    res.status(201).json(populated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get all tasks (admin) with optional status filter
// @route   GET /api/tasks/admin
// @access  Private/Admin
const getAdminTasks = async (req, res) => {
  try {
    const { status, ownerType } = req.query;
    const query = { createdBy: req.user._id };

    if (status && status !== "all") {
      query.status = status;
    }

    if (ownerType && ["employee", "trainee"].includes(ownerType)) {
      query.ownerType = ownerType;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get tasks assigned to current user
// @route   GET /api/tasks/my
// @access  Private (user)
const getMyTasks = async (req, res) => {
  try {
    if (req.user.role !== "user" && req.user.role !== "trainee") {
      return res.status(403).json({ message: "Only users can view their tasks" });
    }

    const { status } = req.query;
    const query = { assignedTo: req.user._id };

    if (status && status !== "all") {
      query.status = status;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// @desc    Get task statistics (admin)
// @route   GET /api/tasks/stats
// @access  Private/Admin
const getTaskStats = async (req, res) => {
  try {
    // Get stats only for tasks created by this admin
    const total = await Task.countDocuments({ createdBy: req.user._id });
    const pending = await Task.countDocuments({ 
      createdBy: req.user._id, 
      status: "pending" 
    });
    const inProgress = await Task.countDocuments({ 
      createdBy: req.user._id, 
      status: "in-progress" 
    });
    const completed = await Task.countDocuments({ 
      createdBy: req.user._id, 
      status: "completed" 
    });

    const priorityAgg = await Task.aggregate([
      { $match: { createdBy: req.user._id } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    const priority = {
      low: priorityAgg.find((p) => p._id === "low")?.count || 0,
      medium: priorityAgg.find((p) => p._id === "medium")?.count || 0,
      high: priorityAgg.find((p) => p._id === "high")?.count || 0,
    };

    const recentTasks = await Task.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title status priority dueDate createdAt")
      .lean();

    res.json({
      counts: {
        total,
        pending,
        inProgress,
        completed,
      },
      priority,
      recentTasks,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update task (admin)
// @route   PUT /api/tasks/:id
// @access  Private/Admin
const updateTask = async (req, res) => {
  try {
    const body = req.body || {};
    const checklist = parseMaybeJSON(body.checklist);
    const attachments = parseMaybeJSON(body.attachments);

    const updateData = {
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
      dueDate: body.dueDate,
      assignedTo: body.assignedTo,
    };

    if (Array.isArray(checklist)) updateData.checklist = checklist;
    if (Array.isArray(attachments)) updateData.attachments = attachments;

    const task = await Task.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update task status (user/admin)
// @route   PATCH /api/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "in-progress", "completed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAssigned =
      task.assignedTo && task.assignedTo.toString() === req.user._id.toString();

    if (req.user.role !== "admin" && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to update this task" });
    }

    task.status = status;
    await task.save();

    const populated = await Task.findById(task._id)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email");

    res.json(populated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update checklist (replace list or toggle one item)
// @route   PATCH /api/tasks/:id/checklist
// @access  Private
const updateChecklistItem = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAssigned =
      task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to update this task" });
    }

    // Support full checklist replacement: { checklist: [{ text, done }] }
    if (Array.isArray(req.body?.checklist)) {
      task.checklist = req.body.checklist.map((item) => ({
        text: item.text,
        done: !!item.done,
      }));
    } else {
      // Backward-compatible single item toggle: { itemId, done }
      const { itemId, done } = req.body;
      const checklistItem = task.checklist.id(itemId);
      if (!checklistItem) {
        return res.status(404).json({ message: "Checklist item not found" });
      }
      checklistItem.done = typeof done === "boolean" ? done : !checklistItem.done;
    }

    await task.save();

    const populated = await Task.findById(task._id)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email");

    res.json(populated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete task (admin)
// @route   DELETE /api/tasks/:id
// @access  Private/Admin
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Ensure admin can only delete their own tasks
    if (task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this task" });
    }

    // Remove task from admin's createdTasks
    await Admin.findByIdAndUpdate(req.user._id, {
      $pull: { createdTasks: task._id },
    });

    await task.deleteOne();
    res.json({ message: "Task removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get single task (useful for details)
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignedTo", "fullName email avatar")
      .populate("createdBy", "fullName email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const isAssigned =
      task.assignedTo && task.assignedTo._id && task.assignedTo._id.toString() === req.user._id.toString();

    if (req.user.role !== "admin" && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to view this task" });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Import tasks from PDF
// @route   POST /api/tasks/import/pdf
// @access  Private
const importTasksFromPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No PDF file provided" });
    }

    // Check if file is PDF
    if (
      req.file.mimetype !== "application/pdf" &&
      !req.file.originalname.endsWith(".pdf")
    ) {
      return res.status(400).json({ message: "File must be a PDF" });
    }

    // Prefer LLM extraction when OpenAI is configured, otherwise rule-based
    const useOpenAI = !!process.env.OPENAI_API_KEY;
    const result = await parsePdfTasks(req.file.buffer, useOpenAI);

    // Use ONLY validated tasks returned by parsePdfTasks()
    const { tasks: parsedTasks, errors, fixes } = result;

    // If nothing valid extracted, return 400 with details
    if (!parsedTasks || parsedTasks.length === 0) {
      return res.status(400).json({
        message: "No valid tasks extracted from PDF",
        errors,
      });
    }

    // Build de-duplication key set for existing tasks
    const userId = req.user._id.toString();
    const toDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

    const parsedTitles = parsedTasks.map((t) => normalizeTitle(t.title)).filter(Boolean);
    const parsedDueDates = parsedTasks
      .map((t) => (t.dueDate ? toDateOnly(t.dueDate) : null))
      .filter(Boolean);
    const hasNullDue = parsedTasks.some((t) => !t.dueDate);

    const existingQuery = { createdBy: req.user._id };
    const orConds = [];
    if (parsedTitles.length) orConds.push({ title: { $in: parsedTitles } });
    if (parsedDueDates.length) orConds.push({ dueDate: { $in: parsedDueDates.map((d) => new Date(d)) } });
    if (hasNullDue) orConds.push({ dueDate: null });
    if (orConds.length) existingQuery.$or = orConds;

    const existing = await Task.find(existingQuery).select("title dueDate createdBy");
    console.log("[PDF Import] Existing tasks fetched:", existing.length);
    const existingKeySet = new Set(
      existing.map((doc) => {
        const titleKey = normalizeTitle(doc.title);
        const dueKey = doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : "null";
        return `${userId}|${titleKey}|${dueKey}`;
      })
    );

    // Build assignTo mapping cache (optional)
    const assignStrings = Array.from(new Set(parsedTasks.map(t => (t.assignTo || '').trim()).filter(Boolean)));
    const assignMap = {};
    if (assignStrings.length) {
      // Match by email first
      const byEmail = await User.find({ email: { $in: assignStrings.map(s => s.toLowerCase()) } }).select('_id email fullName');
      byEmail.forEach(u => { assignMap[u.email.toLowerCase()] = u._id; });
      // Then match by exact fullName for remaining
      const remainingNames = assignStrings.filter(s => !assignMap[s.toLowerCase()]);
      if (remainingNames.length) {
        const byName = await User.find({ fullName: { $in: remainingNames } }).select('_id fullName email');
        byName.forEach(u => { assignMap[u.fullName] = u._id; });
      }
    }

    // Prepare tasks for database insert with duplicate skipping
    const skipped = [];
    const tasksToInsert = [];

    parsedTasks.forEach((task, index) => {
      const titleKey = normalizeTitle(task.title);
      const dueKey = task.dueDate ? toDateOnly(task.dueDate) : "null";
      const key = `${userId}|${titleKey}|${dueKey}`;
      if (existingKeySet.has(key)) {
        skipped.push({ index, title: task.title, reason: "duplicate" });
        return; // skip duplicates
      }
      existingKeySet.add(key); // prevent duplicates within same PDF

      const assignedTo = (() => {
        if (task.assignTo) {
          const keyEmail = (task.assignTo || '').toLowerCase();
          if (assignMap[keyEmail]) return assignMap[keyEmail];
          if (assignMap[task.assignTo]) return assignMap[task.assignTo];
        }
        return null;
      })();

      const requestedAssignee = task.assignTo ? `Requested assignee: ${task.assignTo}` : "";

      // Normalize checklist entries to object form { text, done }
      const checklist = Array.isArray(task.checklist)
        ? task.checklist
            .map((item) => {
              if (typeof item === "string") {
                const text = item.trim();
                return text ? { text, done: false } : null;
              }
              if (item && typeof item === "object") {
                const text = String(item.text || "").trim();
                const done = !!item.done;
                return text ? { text, done } : null;
              }
              return null;
            })
            .filter(Boolean)
        : [];

      tasksToInsert.push({
        ...task,
        priority: (task.priority || "medium").toLowerCase(),
        status: "pending",
        createdBy: req.user._id,
        source: "pdf",
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        checklist,
        ownerType: "employee",
        assignedTo,
        assignmentReason: assignedTo ? requestedAssignee : requestedAssignee || "",
      });
    });

    // Bulk insert
    let createdTasks = [];
    if (tasksToInsert.length > 0) {
      // Debug: verify checklist object format before saving
      console.log(
        "[PDF Import][debug] checklist first item",
        tasksToInsert[0]?.checklist?.[0],
        typeof tasksToInsert[0]?.checklist?.[0]
      );

      const inserted = await Task.insertMany(tasksToInsert);
      console.log("[PDF Import] Inserted tasks:", inserted.length);

      // Update admin's createdTasks array
      await Admin.findByIdAndUpdate(req.user._id, {
        $push: { createdTasks: { $each: inserted.map((t) => t._id) } },
      });

      // Populate for response
      createdTasks = await Task.find({
        _id: { $in: inserted.map((t) => t._id) },
      })
        .populate("assignedTo", "fullName email avatar")
        .populate("createdBy", "fullName email");
    }

    res.status(201).json({
      message: "PDF import completed",
      createdCount: createdTasks.length,
      skippedCount: skipped.length,
      fixedCount: fixes?.length || 0,
      skipped,
      errors,
      fixes: fixes || [],
      createdTasks: createdTasks.map((t) => ({
        _id: t._id,
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    });
  } catch (error) {
    console.error("PDF import error:", error);
    res.status(500).json({ message: "PDF import failed", error: error.message });
  }
};

// @desc    Auto-distribute tasks to employees
// @route   POST /api/tasks/auto-distribute
// @access  Private
const distributeTasksAuto = async (req, res) => {
  try {
    const { status } = req.body;

    // Only allow admins or task creators to distribute
    const filter = status ? { status } : {};

    const result = await autoDistributeTasks(req.user._id, filter);

    res.json({
      message: "Auto-distribution completed",
      ...result,
    });
  } catch (error) {
    console.error("Auto-distribution error:", error);
    res
      .status(500)
      .json({
        message: "Auto-distribution failed",
        error: error.message,
      });
  }
};

module.exports = {
  createTask,
  getAdminTasks,
  getMyTasks,
  getTaskStats,
  updateTask,
  updateTaskStatus,
  updateChecklistItem,
  deleteTask,
  getTaskById,
  importTasksFromPDF,
  distributeTasksAuto,
};
