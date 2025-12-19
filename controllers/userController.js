const User = require("../models/User");
const Task = require("../models/Task");

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update current user profile
// @route   PUT /api/users/me
// @access  Private
const updateCurrentUser = async (req, res) => {
  try {
    const allowedFields = ["fullName", "email", "avatar"];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.email) {
      const existing = await User.findOne({ email: updateData.email, _id: { $ne: req.user._id } });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get user statistics
// @route   GET /api/users/:id/stats
// @access  Private/Admin
const getUserStats = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const total = await Task.countDocuments({ assignedTo: req.params.id });
    const pending = await Task.countDocuments({
      assignedTo: req.params.id,
      status: "pending",
    });
    const inProgress = await Task.countDocuments({
      assignedTo: req.params.id,
      status: "in-progress",
    });
    const completed = await Task.countDocuments({
      assignedTo: req.params.id,
      status: "completed",
    });

    res.json({
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
      },
      stats: {
        total,
        pending,
        inProgress,
        completed,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const allowedFields = ["fullName", "email", "avatar", "isActive"];
    const updateData = {};
    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        updateData[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Upload avatar for current user
// @route   POST /api/users/me/avatar
// @access  Private
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: imageUrl },
      { new: true }
    ).select("-password");

    res.json({ url: imageUrl, user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.deleteOne();
    res.json({ message: "User removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get all team members with stats
// @route   GET /api/users/team/stats
// @access  Private/Admin
const getTeamStats = async (req, res) => {
  try {
    const users = await User.find().select("-password");

    const teamStats = await Promise.all(
      users.map(async (user) => {
        const total = await Task.countDocuments({ assignedTo: user._id });
        const pending = await Task.countDocuments({
          assignedTo: user._id,
          status: "pending",
        });
        const inProgress = await Task.countDocuments({
          assignedTo: user._id,
          status: "in-progress",
        });
        const completed = await Task.countDocuments({
          assignedTo: user._id,
          status: "completed",
        });

        return {
          user: {
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            avatar: user.avatar,
          },
          stats: {
            total,
            pending,
            inProgress,
            completed,
          },
        };
      })
    );

    res.json(teamStats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getUsers,
  getCurrentUser,
  updateCurrentUser,
  getUserById,
  getUserStats,
  updateUser,
  deleteUser,
  getTeamStats,
  uploadAvatar,
};
