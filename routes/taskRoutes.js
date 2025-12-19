const express = require("express");
const router = express.Router();
const {
  createTask,
  getAdminTasks,
  getMyTasks,
  getTaskStats,
  updateTask,
  updateTaskStatus,
  updateChecklistItem,
  deleteTask,
  getTaskById,
} = require("../controllers/taskController");
const { protect, admin } = require("../middlewares/authMiddleware");

// Admin create task
router.post("/", protect, admin, createTask);

// Admin list tasks
router.get("/admin", protect, admin, getAdminTasks);

// User list own tasks
router.get("/my", protect, getMyTasks);

// Stats
router.get("/stats", protect, admin, getTaskStats);

// Single task
router.get("/:id", protect, getTaskById);

// Admin update/delete task
router.put("/:id", protect, admin, updateTask);
router.delete("/:id", protect, admin, deleteTask);

// Status & checklist updates
router.patch("/:id/status", protect, updateTaskStatus);
router.patch("/:id/checklist", protect, updateChecklistItem);

module.exports = router;
