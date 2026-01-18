# CV Upload Implementation - Backend Guide

## Overview
Frontend now supports CV file upload during user creation. Backend needs to handle multipart/form-data requests and parse PDF CVs.

## Frontend Changes Complete ✅

The Add New User modal now includes:
- CV file input (PDF only, max 5MB)
- File validation and preview
- FormData submission with multipart/form-data
- Success/failure messaging based on CV parsing result

### Frontend API Contract
```javascript
POST /api/users (multipart/form-data)
{
  fullName: "John Doe",
  email: "john@example.com",
  password: "password",
  role: "user",
  isActive: true,
  phone: "+1234567890",
  department: "Engineering",
  position: "Developer",
  cvFile: File (PDF only, max 5MB, optional)
}
```

### Expected Response
```javascript
{
  // User object (existing)
  _id: "...",
  fullName: "John Doe",
  email: "john@example.com",
  role: "user",
  // ... other user fields ...
  
  // NEW: CV parsing result (optional, only if cvFile provided)
  cvParsedData: {
    extractedSkills: [
      { name: "React", proficiency: "expert" },
      { name: "Node.js", proficiency: "intermediate" }
    ],
    extractedInfo: {
      email: "john@example.com",
      phone: "+1234567890",
      experience: "5 years"
    },
    status: "parsed" // or "failed"
  }
}
```

## Backend Implementation Required

### 1. Update User Controller
**File:** `controllers/userController.js`

```javascript
const createUser = async (req, res) => {
  try {
    const { fullName, email, password, role, isActive, phone, department, position } = req.body;
    const cvFile = req.files?.cvFile || req.file; // Handle multer middleware

    // Validate required fields
    if (!fullName || !email) {
      return res.status(400).json({ message: "Full name and email required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Create user object
    const userData = {
      fullName,
      email,
      role: role || "user",
      isActive: isActive !== false,
      phone: phone || "",
      department: department || "",
      position: position || ""
    };

    // Add password if provided, otherwise generate random
    if (password) {
      userData.password = await hashPassword(password);
    } else {
      userData.password = await hashPassword(generateRandomPassword(12));
    }

    const user = await User.create(userData);

    // Parse CV if provided
    let cvParsedData = null;
    if (cvFile) {
      try {
        cvParsedData = await parseCVFile(cvFile);
        // Store in user profile (adjust based on User schema)
        user.cvData = cvParsedData;
        await user.save();
      } catch (cvError) {
        console.error("CV parsing error:", cvError);
        // Continue - user is created, just CV parsing failed
        cvParsedData = {
          status: "failed",
          error: cvError.message
        };
      }
    }

    res.status(201).json({
      message: "User created successfully",
      user: user.toObject(),
      cvParsedData: cvParsedData
    });

  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      message: "Failed to create user",
      error: error.message
    });
  }
};
```

### 2. Create PDF Parser Service
**File:** `services/cvParsingService.js`

```javascript
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

/**
 * Parse PDF CV file and extract skills and information
 * @param {Object} cvFile - File object from multer
 * @returns {Promise<Object>} Extracted CV data
 */
const parseCVFile = async (cvFile) => {
  try {
    let fileBuffer;

    // Handle different file input types
    if (Buffer.isBuffer(cvFile)) {
      fileBuffer = cvFile;
    } else if (cvFile.path) {
      // File uploaded to disk
      fileBuffer = fs.readFileSync(cvFile.path);
    } else if (cvFile.buffer) {
      // File in memory
      fileBuffer = cvFile.buffer;
    } else {
      throw new Error("Invalid file format");
    }

    // Parse PDF
    const pdfData = await pdfParse(fileBuffer);
    const text = pdfData.text.toLowerCase();

    // Extract skills
    const extractedSkills = extractSkills(text);

    // Extract contact information
    const extractedInfo = extractContactInfo(text);

    // Extract experience
    const experience = extractExperience(text);

    // Clean up if file was saved to disk
    if (cvFile.path) {
      fs.unlinkSync(cvFile.path);
    }

    return {
      extractedSkills,
      extractedInfo,
      experience,
      status: "parsed"
    };

  } catch (error) {
    console.error("CV parsing failed:", error);
    throw new Error(`Failed to parse CV: ${error.message}`);
  }
};

/**
 * Extract skills from CV text
 */
const extractSkills = (text) => {
  const skillKeywords = {
    frontend: ["react", "vue", "angular", "javascript", "tsx", "jsx", "css", "html", "ui", "frontend"],
    backend: ["node", "express", "api", "database", "db", "server", "backend", "rest", "graphql", "mongodb", "mysql", "postgres"],
    ai: ["ai", "ml", "machine learning", "deep learning", "llm", "gpt", "neural", "model"],
    devops: ["docker", "kubernetes", "ci/cd", "deploy", "devops", "infrastructure", "aws"],
    qa: ["test", "qa", "quality", "automation", "selenium", "jest"],
    other: ["python", "java", "c++", "typescript", "git", "linux", "agile", "scrum"]
  };

  const extractedSkills = [];
  const foundSkills = new Set();

  for (const [category, keywords] of Object.entries(skillKeywords)) {
    keywords.forEach(keyword => {
      if (text.includes(keyword) && !foundSkills.has(keyword)) {
        foundSkills.add(keyword);
        // Determine proficiency based on frequency or keywords
        const proficiency = determineProficiency(text, keyword);
        extractedSkills.push({
          name: capitalizeSkill(keyword),
          proficiency: proficiency,
          category: category
        });
      }
    });
  }

  // Sort by proficiency
  const proficiencyOrder = { expert: 0, intermediate: 1, beginner: 2 };
  extractedSkills.sort((a, b) => proficiencyOrder[a.proficiency] - proficiencyOrder[b.proficiency]);

  return extractedSkills.slice(0, 10); // Return top 10 skills
};

/**
 * Determine proficiency level based on text patterns
 */
const determineProficiency = (text, skill) => {
  const skillPattern = new RegExp(skill, "g");
  const occurrences = (text.match(skillPattern) || []).length;

  const expertKeywords = ["expert", "senior", "lead", "master", "proficient"];
  const intermediateKeywords = ["experienced", "worked with", "familiar", "knowledge"];

  const hasExpert = expertKeywords.some(kw => text.includes(kw) && text.indexOf(kw) < text.indexOf(skill) + 100);
  const hasIntermediate = intermediateKeywords.some(kw => text.includes(kw) && text.indexOf(kw) < text.indexOf(skill) + 100);

  if (hasExpert || occurrences > 5) return "expert";
  if (hasIntermediate || occurrences > 2) return "intermediate";
  return "beginner";
};

/**
 * Extract contact information from CV
 */
const extractContactInfo = (text) => {
  const info = {};

  // Email pattern
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) info.email = emailMatch[0];

  // Phone pattern
  const phoneMatch = text.match(/(\+?[\d\s\-\(\)]{10,})/);
  if (phoneMatch) info.phone = phoneMatch[0].trim();

  // Extract location if present
  const locationKeywords = ["based in", "located in", "location"];
  locationKeywords.forEach(kw => {
    const locationPattern = new RegExp(`${kw}[\\s:]*([a-zA-Z\\s,]+)`, "i");
    const match = text.match(locationPattern);
    if (match) info.location = match[1].trim();
  });

  return info;
};

/**
 * Extract years of experience
 */
const extractExperience = (text) => {
  const expPatterns = [
    /(\d+)\+?\s*years?\s*(?:of\s*)?(?:professional\s*)?experience/gi,
    /experience:\s*(\d+)\+?\s*years?/gi,
    /(\d+)\+?\s*years?\s*in\s*(?:the\s*)?(?:field|industry)/gi
  ];

  for (const pattern of expPatterns) {
    const match = text.match(pattern);
    if (match) {
      const years = match[0].match(/\d+/)[0];
      return `${years} years`;
    }
  }

  return null;
};

/**
 * Capitalize skill name properly
 */
const capitalizeSkill = (skill) => {
  const exceptions = {
    "c++": "C++",
    "java": "Java",
    "python": "Python",
    "nodejs": "Node.js",
    "graphql": "GraphQL",
    "rest": "REST",
    "api": "API",
    "ci/cd": "CI/CD",
    "llm": "LLM",
    "ai": "AI",
    "ml": "ML"
  };

  return exceptions[skill] || skill.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};

module.exports = {
  parseCVFile,
  extractSkills,
  extractContactInfo,
  extractExperience
};
```

### 3. Setup Multer Middleware
**File:** `middlewares/uploadMiddleware.js`

```javascript
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.memoryStorage(); // Store in memory for processing

const fileFilter = (req, file, cb) => {
  // Accept only PDF files
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = upload;
```

### 4. Update Route
**File:** `routes/userRoutes.js`

```javascript
const express = require("express");
const { createUser, getUsers } = require("../controllers/userController");
const { protect, adminOnly } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

const router = express.Router();

// POST /api/users - Create user (with optional CV)
// Support both form data and JSON
router.post(
  "/",
  protect,
  adminOnly,
  upload.single("cvFile"), // Handle single file upload
  createUser
);

// GET /api/users
router.get("/", protect, adminOnly, getUsers);

module.exports = router;
```

### 5. Update User Model
**File:** `models/User.js`

```javascript
const userSchema = new Schema({
  // ... existing fields ...
  cvData: {
    extractedSkills: [
      {
        name: String,
        proficiency: String, // expert, intermediate, beginner
        category: String
      }
    ],
    extractedInfo: {
      email: String,
      phone: String,
      location: String
    },
    experience: String,
    status: String, // parsed, failed
    error: String,
    uploadedAt: { type: Date, default: null }
  },
  // ... rest of schema ...
});
```

## Installation

Add required packages:
```bash
npm install pdf-parse multer
```

## Integration Checklist

- [ ] Install `pdf-parse` and `multer` packages
- [ ] Create `cvParsingService.js` with parsing logic
- [ ] Create `uploadMiddleware.js` with multer config
- [ ] Update `userController.js` with CV handling
- [ ] Update `User.js` model with `cvData` field
- [ ] Update `userRoutes.js` with upload middleware
- [ ] Test user creation with CV
- [ ] Test user creation without CV
- [ ] Test parsing failure scenario
- [ ] Verify CV data stored in database

## Testing

### Test 1: Create user with valid CV
```bash
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer TOKEN" \
  -F "fullName=John Doe" \
  -F "email=john@example.com" \
  -F "role=user" \
  -F "cvFile=@/path/to/resume.pdf"

Expected: 201 with cvParsedData
```

### Test 2: Create user without CV
```bash
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "role": "user"
  }'

Expected: 201 without cvParsedData
```

### Test 3: Invalid file type
Expected: 400 error "Only PDF files are allowed"

### Test 4: File too large
Expected: 413 error "File too large"

## Success Messages (Frontend)

### CV Parsed Successfully
- Message: "User created successfully! CV parsed and saved."
- Condition: `cvFile && data.cvParsedData`

### CV Upload Failed but User Created
- Message: "User created! CV upload attempted but parsing failed. You can retry from user profile."
- Condition: `cvFile && !data.cvParsedData`

### No CV Provided
- Message: "User created successfully!"
- Condition: No cvFile or `!cvFile`

## Future Enhancement

The extracted CV data (`cvParsedData`) is now available for:
- Auto-distribute task matching (use extracted skills)
- Profile enrichment (auto-fill user profile fields)
- Skill-based team recommendations
- Experience-based task assignment

Store the CV data in the applicant profile for trainee route matching in auto-distribute feature.
