const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { myTrainingTasks } = require("../controllers/traineePortalController");
const { submitTask, getDashboard } = require("../controllers/traineeTaskController");
const { requestWithdraw } = require("../controllers/traineeLifecycleController");

router.get("/me/tasks", protect, myTrainingTasks);
router.get("/me/dashboard", protect, getDashboard);
router.post("/tasks/:taskId/submit", protect, submitTask);
router.post("/me/withdraw-request", protect, requestWithdraw);

module.exports = router;