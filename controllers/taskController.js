const Task = require("../models/Task");

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
    const { status } = req.query;
    const query = {};

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

// @desc    Get tasks assigned to current user
// @route   GET /api/tasks/my
// @access  Private (user)
const getMyTasks = async (req, res) => {
  try {
    if (req.user.role !== "user") {
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
    const total = await Task.countDocuments();
    const pending = await Task.countDocuments({ status: "pending" });
    const inProgress = await Task.countDocuments({ status: "in-progress" });
    const completed = await Task.countDocuments({ status: "completed" });

    const priorityAgg = await Task.aggregate([
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    const priority = {
      low: priorityAgg.find((p) => p._id === "low")?.count || 0,
      medium: priorityAgg.find((p) => p._id === "medium")?.count || 0,
      high: priorityAgg.find((p) => p._id === "high")?.count || 0,
    };

    const recentTasks = await Task.find()
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

    const isAssigned = task.assignedTo.some(
      (u) => u.toString() === req.user._id.toString()
    );

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

    const isAssigned = task.assignedTo.some(
      (u) => u.toString() === req.user._id.toString()
    );
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

    const isAssigned = task.assignedTo.some(
      (u) => u._id.toString() === req.user._id.toString()
    );

    if (req.user.role !== "admin" && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to view this task" });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
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
};
