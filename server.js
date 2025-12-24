require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

// Connect to MongoDB
connectDB();

const app = express();

// Middleware to handle CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/hr", require("./routes/hrApplicantRoutes"));
app.use("/api/hr", require("./routes/traineeRoutes"));
app.use("/api/hr/trainees", require("./routes/traineeLifecycleRoutes"));
app.use("/api/trainee", require("./routes/traineePortalRoutes"));
app.use("/api/hr/gmail", require("./routes/hrGmailRoutes"));
app.use("/api/gmail", require("./routes/gmailRoutes")); // Comprehensive Gmail routes
app.use("/api/personal", require("./routes/personalGmailRoutes")); // Personal Gmail routes

app.use("/api/assistant", require("./routes/assistantRoutes"));
app.use("/api/chat", require("./routes/chatRoutes")); // Chat routes

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Kira Task Manager API is running" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!", error: err.message });
});

// Start Server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
