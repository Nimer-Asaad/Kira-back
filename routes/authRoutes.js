const express = require("express");
const router = express.Router();
const { registerUser, registerAdmin, loginUser, getMe, updateMe } = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/signup", registerUser);
router.post("/admin/signup", registerAdmin);
router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.put("/me", protect, updateMe);

module.exports = router;
