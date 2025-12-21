const express = require("express");
const router = express.Router();
const { protect, hrOrAdmin } = require("../middlewares/authMiddleware");
const uploadPdf = require("../middlewares/pdfUpload");
const {
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
  hrRescoreTask,
  getAiStatus,
} = require("../controllers/traineeController");
const { hrRescoreTrainingTask } = require("../controllers/traineeTaskController");

// HR routes
router.get("/trainees", protect, hrOrAdmin, listTrainees);
router.get("/dashboard/trainees", protect, hrOrAdmin, getDashboardTrainees);
router.post("/trainees/from-applicant/:applicantId", protect, hrOrAdmin, createFromApplicant);
router.post("/trainees/:traineeId/generate-tasks", protect, hrOrAdmin, generateTasks);
router.post("/trainees/:traineeId/generate-tasks-pdf", protect, hrOrAdmin, uploadPdf.single("pdf"), generateTasks);
router.get("/trainees/:traineeId/tasks", protect, hrOrAdmin, getTraineeTasks);
router.patch("/trainees/:traineeId/evaluate", protect, hrOrAdmin, evaluateTrainee);
router.put("/trainees/:traineeId/evaluation", protect, hrOrAdmin, saveHrEvaluation);
router.post("/trainees/:traineeId/promote", protect, hrOrAdmin, promoteTrainee);
router.get("/trainees/stats", protect, hrOrAdmin, traineeStats);
router.post("/trainees/:traineeId/link-user", protect, hrOrAdmin, linkUser);
router.delete("/trainees/:id/revert-to-hired", protect, hrOrAdmin, revertToHired);
router.post("/trainees/:traineeId/tasks/:taskId/rescore", protect, hrOrAdmin, hrRescoreTask);
router.post("/training-tasks/:taskId/ai-rescore", protect, hrOrAdmin, hrRescoreTrainingTask);
router.get("/ai/status", protect, hrOrAdmin, getAiStatus);

module.exports = router;