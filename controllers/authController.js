const User = require("../models/User");
const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");

// Generate JWT Token with role type
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// @desc    Register new user
// @route   POST /api/auth/signup
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { fullName, email, password, mode } = req.body;

    // Log request for debugging
    console.log("Signup request:", { fullName, email, mode, hasPassword: !!password });

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({ 
        message: "Please provide all required fields",
        details: { missing: { fullName: !fullName, email: !email, password: !password } }
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Determine role and workspace mode
    let userRole = "user";
    let workspaceMode = "company";
    
    if (mode === "personal") {
      userRole = "personal";
      workspaceMode = "personal";
    }

    // Create user
    const userData = {
      fullName,
      email,
      password,
      role: userRole,
      workspaceMode: workspaceMode,
    };

    console.log("Creating user with data:", { ...userData, password: "[HIDDEN]" });

    const user = await User.create(userData);

    if (!user) {
      return res.status(400).json({ message: "Invalid user data" });
    }

    const token = generateToken(user._id, userRole);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: userRole,
        workspaceMode: workspaceMode,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    // Return detailed error for debugging
    res.status(500).json({ 
      message: "Server error", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Register new admin
// @route   POST /api/auth/admin/signup
// @access  Public (with admin invite token)
const registerAdmin = async (req, res) => {
  try {
    const { fullName, email, password, adminInviteToken } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !adminInviteToken) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Verify admin invite token
    if (adminInviteToken !== process.env.ADMIN_INVITE_TOKEN) {
      return res.status(400).json({ message: "Invalid admin invite token" });
    }

    // Check if admin exists
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    // Create admin
    const admin = await Admin.create({
      fullName,
      email,
      password,
    });

    if (!admin) {
      return res.status(400).json({ message: "Invalid admin data" });
    }

    const token = generateToken(admin._id, "admin");

    res.status(201).json({
      token,
      user: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin signup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Authenticate user or admin
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user first
    let user = await User.findOne({ email });
    let role = null;

    // If not found in User collection, check Admin collection
    if (!user) {
      user = await Admin.findOne({ email });
      if (user) {
        role = "admin";
      }
    } else {
      // User found in User collection, use their role (user or hr)
      role = user.role || "user";
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user._id, role);

    res.json({
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        role: role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get current user or admin
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const { role } = req.user;
    
    let user;
    if (role === "admin") {
      user = await Admin.findById(req.user._id).select("-password");
    } else {
      user = await User.findById(req.user._id).select("-password");
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update current user or admin profile
// @route   PUT /api/auth/me
// @access  Private
const updateMe = async (req, res) => {
  try {
    const { role } = req.user;
    const allowedFields = ["fullName", "email", "avatar"];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        updateData[field] = req.body[field];
      }
    });

    // Check if email is already in use by someone else
    if (updateData.email) {
      const Model = role === "admin" ? Admin : User;
      const existing = await Model.findOne({ 
        email: updateData.email, 
        _id: { $ne: req.user._id } 
      });
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    const Model = role === "admin" ? Admin : User;
    const updated = await Model.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  registerUser,
  registerAdmin,
  loginUser,
  getMe,
  updateMe,
};
