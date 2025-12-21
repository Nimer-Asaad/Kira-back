const express = require("express");
const router = express.Router();
const { protect, hrOrAdmin } = require("../middlewares/authMiddleware");
const {
  pauseTrainee,
  freezeTrainee,
  resumeTrainee,
  cancelTrainee,
  approveWithdraw,
  rejectWithdraw,
  revertCancel,
} = require("../controllers/traineeLifecycleController");

// All HR lifecycle endpoints require authentication and HR/Admin role
router.patch("/:id/pause", protect, hrOrAdmin, pauseTrainee);
router.patch("/:id/freeze", protect, hrOrAdmin, freezeTrainee);
router.patch("/:id/resume", protect, hrOrAdmin, resumeTrainee);
router.patch("/:id/cancel", protect, hrOrAdmin, cancelTrainee);
router.patch("/:id/revert-cancel", protect, hrOrAdmin, revertCancel);
router.patch("/:id/withdraw/approve", protect, hrOrAdmin, approveWithdraw);
router.patch("/:id/withdraw/reject", protect, hrOrAdmin, rejectWithdraw);

module.exports = router;
