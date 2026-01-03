const express = require("express");
const router = express.Router();
const {
  getDayPlan,
  upsertDayPlan,
  updateBlock,
} = require("../controllers/personalPlannerController");
const { protect } = require("../middlewares/authMiddleware");

// All routes require authentication
router.use(protect);

// GET /api/personal/planner?date=YYYY-MM-DD - Get day plan (create empty if none)
router.get("/planner", getDayPlan);

// PUT /api/personal/planner?date=YYYY-MM-DD - Upsert whole day plan
router.put("/planner", upsertDayPlan);

// PATCH /api/personal/planner/block/:blockId - Update a single block
router.patch("/planner/block/:blockId", updateBlock);

module.exports = router;

