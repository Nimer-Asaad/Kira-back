const Applicant = require("../models/Applicant");
const Email = require("../models/Email");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { PDFDocument } = require("pdf-lib");
const { getJsonFromText } = require("../services/openaiClient");

const allowedStages = ["Applied", "Screening", "Interview", "Offer", "Accepted", "Hired", "Rejected"];

// GET /api/hr/applicants
const listApplicants = async (req, res) => {
  try {
    const { stage, search } = req.query;
    const filters = {};
    if (stage && allowedStages.includes(stage)) {
      filters.stage = stage;
    }
    if (search) {
      const regex = new RegExp(search, "i");
      filters.$or = [{ fullName: regex }, { email: regex }];
    }

    const applicants = await Applicant.find(filters).sort({ createdAt: -1 });
    res.json(applicants);
  } catch (error) {
    console.error("Error listing applicants", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/hr/applicants
const createApplicant = async (req, res) => {
  try {
    const { fullName, email, position, stage, notes } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "fullName and email are required" });
    }

    if (stage && !allowedStages.includes(stage)) {
      return res.status(400).json({ message: "Invalid stage" });
    }

    // Deduplicate by email: if exists, revive/update instead of erroring
    const existing = await Applicant.findOne({ email: email.toLowerCase() });
    if (existing) {
      existing.fullName = fullName;
      existing.position = position || existing.position || "";
      existing.notes = notes || existing.notes || "";
      // If caller passed a stage, apply it, otherwise default to Applied when reviving
      existing.stage = stage && allowedStages.includes(stage) ? stage : (existing.stage || "Applied");
      await existing.save();
      return res.status(200).json(existing);
    }

    const applicant = await Applicant.create({
      fullName,
      email,
      position: position || "",
      stage: stage || undefined,
      notes: notes || "",
      createdBy: req.user?._id?.toString() || "",
    });

    res.status(201).json(applicant);
  } catch (error) {
    console.error("Error creating applicant", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/hr/applicants/:id
const getApplicant = async (req, res) => {
  try {
    const applicant = await Applicant.findById(req.params.id);
    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }
    res.json(applicant);
  } catch (error) {
    console.error("Error fetching applicant", error);
    res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/hr/applicants/:id
const updateApplicant = async (req, res) => {
  try {
    const updates = {};
    const allowed = ["fullName", "email", "position", "stage", "notes"];

    allowed.forEach((field) => {
      if (typeof req.body[field] !== "undefined") {
        updates[field] = req.body[field];
      }
    });

    if (updates.stage && !allowedStages.includes(updates.stage)) {
      return res.status(400).json({ message: "Invalid stage" });
    }

    const applicant = await Applicant.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    res.json(applicant);
  } catch (error) {
    console.error("Error updating applicant", error);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/hr/applicants/:id
const deleteApplicant = async (req, res) => {
  try {
    const applicant = await Applicant.findByIdAndDelete(req.params.id);
    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }
    // Soft-mark related Gmail emails for visibility
    try {
      if (applicant.email) {
        // Mark the most recent email from this sender
        const recentEmail = await Email.findOne({
          userId: req.user._id,
          fromEmail: new RegExp(`^${applicant.email}$`, 'i'),
        }).sort({ date: -1 });

        if (recentEmail) {
          recentEmail.conversionStatus = 'deleted-applicant';
          recentEmail.applicantId = null;
          recentEmail.conversionMarkedAt = new Date();
          await recentEmail.save();
        }

        // Optionally mark all CV-tagged emails from this sender (non-blocking)
        await Email.updateMany(
          { userId: req.user._id, fromEmail: new RegExp(`^${applicant.email}$`, 'i'), isCV: true },
          { $set: { conversionStatus: 'deleted-applicant', applicantId: null, conversionMarkedAt: new Date() } }
        );
      }
    } catch (markErr) {
      console.warn('Failed to mark Gmail emails after applicant deletion:', markErr?.message || markErr);
    }

    res.json({ message: "Applicant deleted", markedGmail: true });
  } catch (error) {
    console.error("Error deleting applicant", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/hr/applicants/:id/cv
const uploadCv = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { filename, originalname, mimetype, size } = req.file;
    const baseUrl = process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${baseUrl}/uploads/cv/${filename}`;

    const cv = {
      filename,
      originalName: originalname,
      mimeType: mimetype,
      size,
      url,
      uploadedAt: new Date(),
    };

    const applicant = await Applicant.findByIdAndUpdate(
      req.params.id,
      { cv },
      { new: true }
    );

    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    res.json(applicant);
  } catch (error) {
    console.error("Error uploading CV", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/hr/applicants/:id/ai-summary
const generateAiSummary = async (req, res) => {
  try {
    const applicant = await Applicant.findById(req.params.id);
    if (!applicant) {
      return res.status(404).json({ message: "Applicant not found" });
    }

    if (!applicant.cv || !applicant.cv.filename) {
      return res.status(400).json({ message: "Applicant CV not found" });
    }

    const cvPath = path.join(__dirname, "..", "uploads", "cv", applicant.cv.filename);
    if (!fs.existsSync(cvPath)) {
      return res.status(404).json({ message: "CV file not found" });
    }

    const buffer = fs.readFileSync(cvPath);
    
    let parsed;
    try {
      // Attempt to repair PDF first using pdf-lib
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const repairedBytes = await pdfDoc.save();
      parsed = await pdfParse(repairedBytes);
    } catch (pdfError) {
      console.error("PDF parsing error:", pdfError.message);
      return res.status(400).json({ 
        message: "Could not parse PDF. The file may be corrupted, password-protected, or an image-only scan." 
      });
    }

    const cvText = parsed?.text || "";

    if (!cvText.trim()) {
      return res.status(400).json({ message: "Could not extract text from PDF. The file may contain only images." });
    }

    const prompt = `Analyze the following CV and return STRICT JSON with:\n{
      candidate_level,
      years_experience_estimate,
      top_skills,
      strengths,
      risks_or_gaps,
      overall_score,
      short_summary
    }\n`;

    let raw;
    try {
      raw = await getJsonFromText(prompt, cvText);
    } catch (err) {
      if (err && err.code === "OPENAI_NOT_CONFIGURED") {
        return res.status(503).json({ message: "OpenAI not configured. Please set OPENAI_API_KEY." });
      }
      throw err;
    }

    let aiSummary = null;
    try {
      if (typeof raw === "object") {
        aiSummary = raw;
      } else {
        const match = (raw || "").match(/\{[\s\S]*\}/);
        aiSummary = match ? JSON.parse(match[0]) : {};
      }
    } catch (e) {
      return res.status(500).json({ message: "Failed to parse AI response" });
    }

    await Applicant.findByIdAndUpdate(applicant._id, { aiSummary }, { new: true });
    return res.json(aiSummary);
  } catch (error) {
    console.error("Error generating AI summary", error);
    const msg =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Server error";
    res.status(500).json({ message: msg });
  }
};

module.exports = {
  listApplicants,
  createApplicant,
  getApplicant,
  updateApplicant,
  deleteApplicant,
  uploadCv,
  generateAiSummary,
  allowedStages,
};
