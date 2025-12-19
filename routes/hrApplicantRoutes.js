const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  listApplicants,
  createApplicant,
  getApplicant,
  updateApplicant,
  deleteApplicant,
  uploadCv,
  generateAiSummary,
  allowedStages,
} = require("../controllers/hrApplicantController");
const { protect, hrOrAdmin } = require("../middlewares/authMiddleware");

const router = express.Router();

// Ensure CV uploads directory exists
const cvDir = path.join(__dirname, "..", "uploads", "cv");
if (!fs.existsSync(cvDir)) {
  fs.mkdirSync(cvDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, cvDir);
  },
  filename: function (req, file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${unique}${ext}`);
  },
});

const pdfMimeTypes = ["application/pdf", "application/x-pdf", "application/acrobat", "applications/pdf", "text/pdf"];

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype?.toLowerCase() || "";
  const ext = (path.extname(file.originalname) || "").toLowerCase();
  const isMimePdf = pdfMimeTypes.includes(mime) || mime.includes("pdf");
  const isExtPdf = ext === ".pdf";

  if (!isMimePdf && !isExtPdf) {
    return cb(new Error("Only PDF files are allowed"));
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(protect, hrOrAdmin);

router.get("/applicants", listApplicants);
router.post("/applicants", createApplicant);
router.get("/applicants/:id", getApplicant);
router.patch("/applicants/:id", updateApplicant);
router.delete("/applicants/:id", deleteApplicant);
router.post("/applicants/:id/cv", upload.single("cv"), uploadCv);
router.post("/applicants/:id/ai-summary", generateAiSummary);

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err && err.message === "Only PDF files are allowed") {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

module.exports = router;
