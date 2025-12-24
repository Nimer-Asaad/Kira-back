const User = require("../models/User");
const Task = require("../models/Task");

// @desc    Create new user (Admin only)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  try {
    const { fullName, email, password, role, isActive, phone, department, position } = req.body;

    // Validation
    if (!fullName || !email) {
      return res.status(400).json({ message: "Full name and email are required" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Validate role
    const validRoles = ["user", "hr", "trainee"];
    const userRole = validRoles.includes(role) ? role : "user";

    // Create user (password will be hashed by pre-save hook)
    const userData = {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      role: userRole,
      isActive: isActive !== undefined ? isActive : true,
    };

    // Add optional fields
    if (password && password.length >= 6) {
      userData.password = password;
    } else if (password) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    } else {
      // Generate a random password if not provided (user will need to reset)
      userData.password = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    }

    if (phone) userData.phone = phone.trim();
    if (department) userData.department = department.trim();
    if (position) userData.position = position.trim();

    const user = await User.create(userData);

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

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
    const allowedFields = ["fullName", "email", "avatar", "phone", "department", "position", "bio"];
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

// @desc    Update user role (promote to HR or demote to user)
// @route   PATCH /api/users/:id/role
// @access  Private/Admin
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    // Validate role
    if (!role || !["user", "hr"].includes(role)) {
      return res.status(400).json({ message: "Role must be either 'user' or 'hr'" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = role;
    await user.save();

    const updatedUser = await User.findById(req.params.id).select("-password");

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createUser,
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
};
