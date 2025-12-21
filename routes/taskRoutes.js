const express = require("express");
const router = express.Router();
const multer = require("multer");
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
  importTasksFromPDF,
  distributeTasksAuto,
} = require("../controllers/taskController");
const { protect, admin } = require("../middlewares/authMiddleware");

// Multer setup for PDF upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Admin create task
router.post("/", protect, admin, createTask);

// PDF import endpoint
router.post("/import/pdf", protect, upload.single("file"), importTasksFromPDF);

// Auto-distribute endpoint
router.post("/auto-distribute", protect, admin, distributeTasksAuto);

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
