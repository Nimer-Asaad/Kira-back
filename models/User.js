const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    avatar: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "hr", "trainee", "personal", "part_time"],
      default: "user",
    },
    workspaceMode: {
      type: String,
      enum: ["company", "personal"],
      default: "company",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Gmail OAuth tokens
    gmailAccessToken: {
      type: String,
      default: null,
    },
    gmailRefreshToken: {
      type: String,
      default: null,
    },
    gmailTokenExpiry: {
      type: Date,
      default: null,
    },
    // Employee profile for task assignment
    specialization: {
      type: String,
      enum: ["Frontend", "Backend", "AI", "QA", "DevOps", "UI/UX", "General"],
      default: "General",
    },
    skills: [
      {
        name: {
          type: String,
          required: true,
        },
        level: {
          type: Number,
          min: 1,
          max: 5,
          default: 3,
        },
      },
    ],
    maxConcurrentTasks: {
      type: Number,
      default: 5,
    },
    // Additional profile fields
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    department: {
      type: String,
      default: "",
      trim: true,
    },
    position: {
      type: String,
      default: "",
      trim: true,
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    // Track assignment reasons for transparency
    taskAssignmentNotes: [
      {
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Task",
        },
        reason: String,
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
