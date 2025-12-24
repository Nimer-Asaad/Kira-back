const mongoose = require('mongoose');

// Attachment sub-schema
const attachmentSchema = new mongoose.Schema(
  {
    filename: String,
    mimeType: String,
    size: Number,
    extractedText: String, // extracted text from PDF/DOCX
    attachmentId: String, // Gmail attachment ID for retrieval
  },
  { _id: false }
);

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Made optional for backward compatibility
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    workspaceMode: {
      type: String,
      enum: ['company', 'personal'],
      default: 'company',
      index: true,
    },
    gmailId: {
      type: String,
      required: true,
      index: true,
    },
    gmailMessageId: {
      type: String,
      index: true,
    },
    threadId: {
      type: String,
      index: true,
    },
    fromEmail: {
      type: String,
      index: true,
    },
    fromName: String,
    to: [String],
    cc: [String],
    bcc: [String],
    subject: {
      type: String,
      default: '(no subject)',
      index: true,
    },
    snippet: {
      type: String,
    },
    bodyText: {
      type: String,
      default: null,
    },
    bodyHtml: {
      type: String,
      default: null,
    },
    date: {
      type: Date,
      index: true,
    },
    internalDate: Number,
    labelIds: [String],
    labels: [{ type: String, index: true }],
    hasAttachments: {
      type: Boolean,
      default: false,
      index: true,
    },
    attachments: [attachmentSchema],
    tags: [{ type: String, index: true }], // ["CV", "Invoice", "Job"]
    isRead: {
      type: Boolean,
      default: true,
      index: true,
    },
    isStarred: {
      type: Boolean,
      default: false,
      index: true,
    },
    isImportant: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Gmail-specific metadata for smart sorting
    gmailImportance: {
      type: String,
      enum: ['high', 'normal', 'low'],
      default: 'normal',
      index: true,
    },
    gmailCategory: {
      type: String,
      index: true,
    }, // Primary, Social, Promotions, Updates, Forums
    gmailPriority: {
      type: Number,
      default: 0,
      index: true,
    }, // Calculated priority score
    // CV-specific fields
    isCV: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Conversion tracking between Gmail and Applicant records
    conversionStatus: {
      type: String,
      enum: ['none', 'converted', 'not-converted', 'blocked', 'deleted-applicant'],
      default: 'none',
      index: true,
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Applicant',
      default: null,
      index: true,
    },
    conversionMarkedAt: {
      type: Date,
      default: null,
    },
    cvData: {
      candidateName: String,
      skills: [String],
      experience: String,
      role: String,
      score: Number,
      reasoning: String,
    },
    aiSummary: {
      summary: String,
      key_points: [String],
      action_items: [String],
      urgency: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low',
      },
      suggested_stage: {
        type: String,
        enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'unknown'],
        default: 'unknown',
      },
      generatedAt: Date,
    },
    // Personal email AI summary fields
    aiCategory: {
      type: String,
      enum: ['Work', 'Bills', 'Social', 'Promotions', 'Urgent', 'Other'],
      default: null,
    },
    aiImportance: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    // Embedding for smart search
    embedding: { type: [Number], default: undefined },
    lastModifiedTime: String,
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexes for performance
emailSchema.index({ userId: 1, gmailId: 1 }, { unique: true });
emailSchema.index({ userId: 1, gmailMessageId: 1 }, { unique: true });
emailSchema.index({ userId: 1, date: -1 });
emailSchema.index({ userId: 1, labels: 1 });

module.exports = mongoose.model('Email', emailSchema);
