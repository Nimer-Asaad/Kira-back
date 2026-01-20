// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const connectDB = require("./config/db");

// // Connect to MongoDB
// connectDB();

// const app = express();

// // Middleware to handle CORS
// app.use(
//   cors({
//     origin: process.env.CLIENT_URL || "*",
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// // Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Serve static files
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // Routes
// app.use("/api/auth", require("./routes/authRoutes"));
// app.use("/api/tasks", require("./routes/taskRoutes"));
// app.use("/api/users", require("./routes/userRoutes"));
// app.use("/api/reports", require("./routes/reportRoutes"));
// app.use("/api/hr", require("./routes/hrApplicantRoutes"));
// app.use("/api/hr", require("./routes/traineeRoutes"));
// app.use("/api/hr/trainees", require("./routes/traineeLifecycleRoutes"));
// app.use("/api/trainee", require("./routes/traineePortalRoutes"));
// app.use("/api/hr/gmail", require("./routes/hrGmailRoutes"));
// app.use("/api/gmail", require("./routes/gmailRoutes")); // Comprehensive Gmail routes
// app.use("/api/personal", require("./routes/personalGmailRoutes")); // Personal Gmail routes
// app.use("/api/personal", require("./routes/personalTaskRoutes")); // Personal Task routes
// app.use("/api/personal", require("./routes/personalPlannerRoutes")); // Personal Planner routes
// app.use("/api/personal", require("./routes/personalCalendarRoutes")); // Personal Calendar routes

// app.use("/api/assistant", require("./routes/assistantRoutes"));
// app.use("/api/chat", require("./routes/chatRoutes")); // Chat routes

// // Health check
// app.get("/", (req, res) => {
//   res.json({ message: "Kira Task Manager API is running" });
// });

// // Error handler
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ message: "Something went wrong!", error: err.message });
// });

// // Start Server
// const PORT = process.env.PORT || 8000;
// app.listen(PORT, () =>
//   console.log(`Server running on port ${PORT}`)
// );

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const connectDB = require("./config/db");

// Connect to MongoDB
connectDB();

const app = express();

// Trust proxy if configured (useful behind nginx, vercel, etc.)
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Security headers
app.use(helmet());

// Basic rate limiter for /api endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_MAX) || 200, // requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const raw = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || "";
const allowedOrigins = raw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, mobile native apps) in non-production
    if (!origin) {
      return callback(null, process.env.NODE_ENV !== "production");
    }
    // If no origins configured and not production -> allow all
    if (!allowedOrigins.length) {
      return callback(null, process.env.NODE_ENV !== "production");
    }
    // Exact match only (plus simple dev alias for Android emulator)
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Dev helper: if localhost:5173 is allowed, also allow 10.0.2.2:5173 (Android emulator)
    const isDevEmulator =
      process.env.NODE_ENV !== "production" &&
      origin.startsWith("http://10.0.2.2:5173") &&
      allowedOrigins.includes("http://localhost:5173");
    if (isDevEmulator) {
      return callback(null, true);
    }
    // Block others
    return callback(new Error("CORS blocked: origin not allowed"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
  ],
  credentials: true,
};
app.use(cors(corsOptions));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/translate", require("./routes/translateRoutes"));
app.use("/api/hr", require("./routes/hrApplicantRoutes"));
app.use("/api/hr", require("./routes/traineeRoutes"));
app.use("/api/hr/trainees", require("./routes/traineeLifecycleRoutes"));
app.use("/api/trainee", require("./routes/traineePortalRoutes"));
app.use("/api/hr/gmail", require("./routes/hrGmailRoutes"));
app.use("/api/gmail", require("./routes/gmailRoutes"));
app.use("/api/personal", require("./routes/personalGmailRoutes"));
app.use("/api/personal", require("./routes/personalTaskRoutes"));
app.use("/api/personal", require("./routes/personalPlannerRoutes"));
app.use("/api/personal", require("./routes/personalCalendarRoutes"));
app.use("/api/assistant", require("./routes/assistantRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Kira Task Manager API is running" });
});

// Error handler (including CORS errors)
app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  if (err && err.message && err.message.startsWith("CORS blocked")) {
    return res.status(403).json({
      message: "CORS blocked: origin not allowed",
      details: err.message,
    });
  }
  res.status(500).json({
    message: "Something went wrong!",
    error: err.message || String(err),
  });
});

// Start Server (bind to host so emulator/device can reach it)
const PORT = process.env.PORT || 8000;
const HOST = process.env.BIND_HOST || "0.0.0.0" || "localhost" || "10.0.2.2";

app.listen(PORT, HOST, () => {
  console.log(
    `Server running on http://${HOST}:${PORT} (NODE_ENV=${
      process.env.NODE_ENV || "development"
    })`
  );
});
