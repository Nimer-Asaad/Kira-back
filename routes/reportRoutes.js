const express = require("express");
const router = express.Router();
const {
  generateTaskReport,
  generateTeamReport,
} = require("../controllers/reportController");
const { protect, admin } = require("../middlewares/authMiddleware");

router.get("/tasks", protect, admin, generateTaskReport);
router.get("/team", protect, admin, generateTeamReport);

module.exports = router;
