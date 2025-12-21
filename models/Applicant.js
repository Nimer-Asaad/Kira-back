const mongoose = require("mongoose");

const cvSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedAt: Date,
  },
  { _id: false }
);

const applicantSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    position: {
      type: String,
      trim: true,
      default: "",
    },
    stage: {
      type: String,
      enum: ["Applied", "Screening", "Interview", "Offer", "Accepted", "Hired", "Rejected"],
      default: "Applied",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    cv: cvSchema,
    aiSummary: {
      type: Object,
      default: null,
    },
    createdBy: {
      type: String,
      required: false,
      trim: true,
    },
    traineeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trainee",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Applicant", applicantSchema);
