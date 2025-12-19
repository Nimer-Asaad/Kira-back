const express = require("express");
const router = express.Router();
const {
  getUsers,
  getCurrentUser,
  updateCurrentUser,
  getUserById,
  getUserStats,
  updateUser,
  updateUserRole,
  deleteUser,
  getTeamStats,
  uploadAvatar,
} = require("../controllers/userController");
const { protect, admin } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

router.get("/", protect, admin, getUsers);
router
  .route("/me")
  .get(protect, getCurrentUser)
  .put(protect, updateCurrentUser);
router.post("/me/avatar", protect, upload.single("avatar"), uploadAvatar);
router.get("/team/stats", protect, admin, getTeamStats);
router
  .route("/:id")
  .get(protect, admin, getUserById)
  .put(protect, admin, updateUser)
  .delete(protect, admin, deleteUser);
router.patch("/:id/role", protect, admin, updateUserRole);
router.get("/:id/stats", protect, admin, getUserStats);

module.exports = router;
