const express = require("express");
const router = express.Router();
const { protect, hrOrAdmin } = require("../middlewares/authMiddleware");
const { myTrainingTasks, submitTraining, reopenTraining } = require("../controllers/traineePortalController");
const { submitTask, getDashboard } = require("../controllers/traineeTaskController");
const { requestWithdraw } = require("../controllers/traineeLifecycleController");

// Debug route
router.get("/test", (req, res) => {
  res.json({ message: "Trainee routes are working" });
});

router.get("/me/tasks", protect, myTrainingTasks);
router.get("/me/dashboard", protect, getDashboard);
router.post("/tasks/:taskId/submit", protect, submitTask);
router.post("/me/withdraw-request", protect, requestWithdraw);
router.post("/me/submit-training", protect, submitTraining);
router.post("/:traineeId/reopen-training", protect, hrOrAdmin, reopenTraining);

module.exports = router;