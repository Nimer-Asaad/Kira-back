const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectDB = require("../config/db");
const User = require("../models/User");
const Task = require("../models/Task");

const seed = async () => {
  await connectDB();

  console.log("🔄 Clearing existing data...");
  await Promise.all([User.deleteMany({}), Task.deleteMany({})]);

  console.log("👤 Creating users...");
  const admin = await User.create({
    fullName: "Admin User",
    email: "admin@example.com",
    password: "password123",
    role: "admin",
  });

  const users = await Promise.all([
    User.create({
      fullName: "Alice Johnson",
      email: "alice@example.com",
      password: "password123",
      role: "user",
    }),
    User.create({
      fullName: "Bob Smith",
      email: "bob@example.com",
      password: "password123",
      role: "user",
    }),
    User.create({
      fullName: "Carol Lee",
      email: "carol@example.com",
      password: "password123",
      role: "user",
    }),
  ]);

  console.log("📝 Creating tasks...");
  const now = Date.now();
  const tasks = [
    {
      title: "Design landing page",
      description: "Create hero, features, and CTA sections",
      priority: "high",
      status: "in-progress",
      dueDate: new Date(now + 5 * 24 * 60 * 60 * 1000),
      assignedTo: [users[0]._id],
      createdBy: admin._id,
      checklist: [
        { text: "Wireframe", done: true },
        { text: "Mockups", done: false },
      ],
    },
    {
      title: "API integration",
      description: "Connect frontend dashboard widgets to /api endpoints",
      priority: "medium",
      status: "pending",
      dueDate: new Date(now + 8 * 24 * 60 * 60 * 1000),
      assignedTo: [users[1]._id],
      createdBy: admin._id,
      checklist: [
        { text: "Auth wiring", done: true },
        { text: "Tasks fetch", done: false },
      ],
    },
    {
      title: "Write test cases",
      description: "Add basic integration tests for tasks and users",
      priority: "low",
      status: "pending",
      dueDate: new Date(now + 12 * 24 * 60 * 60 * 1000),
      assignedTo: [users[2]._id],
      createdBy: admin._id,
      checklist: [
        { text: "Setup Jest", done: false },
        { text: "API smoke", done: false },
      ],
    },
    {
      title: "Deploy staging",
      description: "Prepare staging environment and deploy latest build",
      priority: "medium",
      status: "completed",
      dueDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
      assignedTo: [users[0]._id, users[1]._id],
      createdBy: admin._id,
      checklist: [
        { text: "Create envs", done: true },
        { text: "Smoke test", done: true },
      ],
    },
    {
      title: "Customer feedback review",
      description: "Triaging feedback from last demo and create follow-ups",
      priority: "high",
      status: "pending",
      dueDate: new Date(now + 3 * 24 * 60 * 60 * 1000),
      assignedTo: [users[2]._id],
      createdBy: admin._id,
      checklist: [
        { text: "Collect notes", done: false },
        { text: "Create action items", done: false },
      ],
    },
  ];

  await Task.insertMany(tasks);
  console.log("✅ Seed data inserted.");
};

seed()
  .then(async () => {
    await mongoose.connection.close();
    console.log("📦 Done.");
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Seed failed:", err);
    await mongoose.connection.close();
    process.exit(1);
  });
