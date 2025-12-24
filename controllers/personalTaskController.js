const Task = require("../models/Task");
const User = require("../models/User");

// @desc    Get all personal tasks for current user
// @route   GET /api/personal/tasks
// @access  Private
const getPersonalTasks = async (req, res) => {
  try {
    const { status, priority, search, sort } = req.query;
    
    // Build query - only tasks owned by this user
    const query = { ownerUserId: req.user._id };

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Priority filter
    if (priority && priority !== "all") {
      query.priority = priority;
    }

    // Search filter (title or description)
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    let sortOption = { createdAt: -1 }; // Default: newest first
    if (sort === "dueDate") {
      sortOption = { dueDate: 1 }; // Due date ascending
    } else if (sort === "priority") {
      sortOption = { priority: -1, createdAt: -1 }; // High priority first
    }

    const tasks = await Task.find(query).sort(sortOption);

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching personal tasks:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get single personal task
// @route   GET /api/personal/tasks/:id
// @access  Private
const getPersonalTaskById = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching personal task:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Create personal task
// @route   POST /api/personal/tasks
// @access  Private
const createPersonalTask = async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, checklist } = req.body;

    // Validation
    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    // Validate status
    const validStatuses = ["pending", "in-progress", "completed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Validate priority
    const validPriorities = ["low", "medium", "high"];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority" });
    }

    // Parse dueDate if it's a string
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ message: "Invalid due date format" });
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      status: status || "pending",
      priority: priority || "medium",
      dueDate: parsedDueDate,
      checklist: checklist || [],
      ownerUserId: req.user._id,
      workspaceMode: "personal",
      // createdBy is not required for personal tasks
      createdBy: null,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating personal task:", error);
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: "Validation error", errors });
    }
    
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update personal task
// @route   PATCH /api/personal/tasks/:id
// @access  Private
const updatePersonalTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const { title, description, status, priority, dueDate, checklist } = req.body;

    // Validate status if provided
    if (status) {
      const validStatuses = ["pending", "in-progress", "completed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      task.status = status;
    }

    // Validate priority if provided
    if (priority) {
      const validPriorities = ["low", "medium", "high"];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }
      task.priority = priority;
    }

    // Update fields
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (checklist !== undefined) task.checklist = checklist;

    await task.save();

    res.json(task);
  } catch (error) {
    console.error("Error updating personal task:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete personal task
// @route   DELETE /api/personal/tasks/:id
// @access  Private
const deletePersonalTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    await Task.findByIdAndDelete(req.params.id);

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting personal task:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getPersonalTasks,
  getPersonalTaskById,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
};

