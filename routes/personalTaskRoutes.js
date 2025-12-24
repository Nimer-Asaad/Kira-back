const express = require("express");
const router = express.Router();
const {
  getPersonalTasks,
  getPersonalTaskById,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
} = require("../controllers/personalTaskController");
const { protect } = require("../middlewares/authMiddleware");

// All routes require authentication
router.use(protect);

// GET /api/personal/tasks - List all personal tasks
router.get("/tasks", getPersonalTasks);

// POST /api/personal/tasks - Create new personal task
router.post("/tasks", createPersonalTask);

// GET /api/personal/tasks/:id - Get single personal task
router.get("/tasks/:id", getPersonalTaskById);

// PATCH /api/personal/tasks/:id - Update personal task
router.patch("/tasks/:id", updatePersonalTask);

// DELETE /api/personal/tasks/:id - Delete personal task
router.delete("/tasks/:id", deletePersonalTask);

module.exports = router;


