const Task = require("../models/Task");
const User = require("../models/User");

const buildCSV = (rows) => {
  if (!rows || !rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    );
  });
  return lines.join("\n");
};

// @desc    Generate task report
// @route   GET /api/reports/tasks
// @access  Private/Admin
const generateTaskReport = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    const report = tasks.map((task) => ({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo.map((u) => u.fullName).join(", "),
      createdBy: task.createdBy.fullName,
      createdAt: task.createdAt,
      completionRate:
        task.checklist.length > 0
          ? `${(
              (task.checklist.filter((c) => c.done).length /
                task.checklist.length) *
              100
            ).toFixed(0)}%`
          : "N/A",
    }));

    const wantsCSV = req.query.format === "csv" || req.headers.accept === "text/csv";
    if (wantsCSV) {
      const csv = buildCSV(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=tasks-report.csv");
      return res.send(csv);
    }

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate team report
// @route   GET /api/reports/team
// @access  Private/Admin
const generateTeamReport = async (req, res) => {
  try {
    const users = await User.find({ role: "user" }).select("-password");

    const report = await Promise.all(
      users.map(async (user) => {
        const total = await Task.countDocuments({ assignedTo: user._id });
        const pending = await Task.countDocuments({
          assignedTo: user._id,
          status: "pending",
        });
        const inProgress = await Task.countDocuments({
          assignedTo: user._id,
          status: "in-progress",
        });
        const completed = await Task.countDocuments({
          assignedTo: user._id,
          status: "completed",
        });

        return {
          fullName: user.fullName,
          email: user.email,
          totalTasks: total,
          pendingTasks: pending,
          inProgressTasks: inProgress,
          completedTasks: completed,
          completionRate: total > 0 ? `${((completed / total) * 100).toFixed(0)}%` : "0%",
        };
      })
    );

    const wantsCSV = req.query.format === "csv" || req.headers.accept === "text/csv";
    if (wantsCSV) {
      const csv = buildCSV(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=team-report.csv");
      return res.send(csv);
    }

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  generateTaskReport,
  generateTeamReport,
};
