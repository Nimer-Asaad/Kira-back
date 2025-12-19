# Gmail Integration - API Response Reference

## All 5 Endpoints with Real Response Examples

### 1️⃣ GET /api/hr/gmail/status

**Purpose:** Check Gmail connection and sync status

**Request:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/status
```

**Response 200 (Connected):**
```json
{
  "status": "connected",
  "lastSync": "2025-12-19T10:30:00.000Z",
  "syncedCount": 45,
  "totalMessages": 150
}
```

**Response 503 (Not Configured):**
```json
{
  "status": "not_configured",
  "message": "Gmail not configured. Missing GOOGLE_REFRESH_TOKEN or credentials."
}
```

**Response 401 (Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

**Response 403 (Not HR/Admin):**
```json
{
  "error": "Not authorized as HR or Admin"
}
```

---

### 2️⃣ POST /api/hr/gmail/sync

**Purpose:** Fetch and cache latest emails from Gmail

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "INBOX",
    "maxResults": 10
  }' \
  http://localhost:8000/api/hr/gmail/sync
```

**Request Body (all optional):**
```javascript
{
  "label": "INBOX",        // Gmail label: INBOX, IMPORTANT, STARRED, SENT, DRAFT
  "maxResults": 10         // Number of emails to fetch (default: 10)
}
```

**Response 200 (Success):**
```json
{
  "message": "Sync completed",
  "syncedCount": 10,
  "totalMessages": 250,
  "hasMore": true
}
```

**Response 200 (No New Emails):**
```json
{
  "message": "No new emails to sync",
  "syncedCount": 0,
  "totalMessages": 100
}
```

**Response 503 (Gmail Not Configured):**
```json
{
  "error": "Gmail not configured",
  "message": "Missing GOOGLE_REFRESH_TOKEN or credentials."
}
```

**Response 500 (Sync Error):**
```json
{
  "error": "Failed to sync emails",
  "details": "Message not found"
}
```

---

### 3️⃣ GET /api/hr/gmail/emails

**Purpose:** List cached emails with pagination and filtering

**Request (with all filters):**
```bash
curl -H "Authorization: Bearer <token>" \
  'http://localhost:8000/api/hr/gmail/emails?q=resume&label=INBOX&page=1&limit=20'
```

**Query Parameters:**
```
q=resume          # Search in subject/from (optional)
label=INBOX       # Filter by label (optional, default: ALL)
page=1            # Page number (optional, default: 1)
limit=20          # Items per page (optional, default: 20)
```

**Response 200:**
```json
{
  "emails": [
    {
      "_id": "67abc123def456789012345",
      "gmailId": "18c123456789abcdef123456",
      "threadId": "18c123456789abcdef123456",
      "from": "recruiter@example.com",
      "to": ["hr@kira.com"],
      "cc": ["manager@kira.com"],
      "subject": "Resume Review - John Doe",
      "snippet": "Hi, please review the attached resume for the senior engineer position...",
      "date": "2025-12-19T09:15:00.000Z",
      "internalDate": "1766200500000",
      "labelIds": ["INBOX", "IMPORTANT"],
      "hasAttachments": true,
      "isRead": true,
      "isStarred": false,
      "aiSummary": null,
      "lastModifiedTime": "18c123",
      "syncedAt": "2025-12-19T10:30:00.000Z",
      "createdAt": "2025-12-19T10:30:00.000Z",
      "updatedAt": "2025-12-19T10:30:00.000Z"
    },
    {
      "_id": "67abc124def456789012345",
      "gmailId": "18c123456789abcdef123457",
      "from": "candidate@example.com",
      "to": ["applications@kira.com"],
      "subject": "Application for Senior Engineer",
      "snippet": "I am writing to express my interest in the senior engineer position...",
      "date": "2025-12-19T08:45:00.000Z",
      "internalDate": "1766198700000",
      "labelIds": ["INBOX"],
      "hasAttachments": true,
      "isRead": false,
      "isStarred": true,
      "aiSummary": null,
      "syncedAt": "2025-12-19T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 125,
    "page": 1,
    "limit": 20,
    "pages": 7
  }
}
```

**Response 200 (No Results):**
```json
{
  "emails": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "pages": 0
  }
}
```

**Response 500:**
```json
{
  "error": "Failed to list emails",
  "details": "Database connection error"
}
```

---

### 4️⃣ GET /api/hr/gmail/emails/:id

**Purpose:** Get full details of a single email

**Request:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/emails/67abc123def456789012345
```

**Response 200:**
```json
{
  "_id": "67abc123def456789012345",
  "userId": "66xyz789abc123456789xyz",
  "gmailId": "18c123456789abcdef123456",
  "threadId": "18c123456789abcdef123456",
  "from": "recruiter@example.com",
  "to": ["hr@kira.com"],
  "cc": ["manager@kira.com"],
  "bcc": [],
  "subject": "Resume Review - John Doe",
  "snippet": "Hi, please review the attached resume for the senior engineer position...",
  "body": "Hi,\n\nPlease find attached the resume of John Doe, a candidate we're considering for the Senior Engineer role.\n\nHe has 8 years of experience in backend development and has led several major projects.\n\nPlease review and let me know your thoughts.\n\nBest regards,\nRecruiter Team",
  "date": "2025-12-19T09:15:00.000Z",
  "internalDate": "1766200500000",
  "labelIds": ["INBOX", "IMPORTANT"],
  "hasAttachments": true,
  "isRead": true,
  "isStarred": false,
  "raw": null,
  "aiSummary": null,
  "lastModifiedTime": "18c123456789",
  "syncedAt": "2025-12-19T10:30:00.000Z",
  "createdAt": "2025-12-19T10:30:00.000Z",
  "updatedAt": "2025-12-19T10:30:00.000Z",
  "__v": 0
}
```

**Response 404 (Email Not Found):**
```json
{
  "error": "Email not found"
}
```

**Response 500:**
```json
{
  "error": "Failed to fetch email",
  "details": "Database connection error"
}
```

---

### 5️⃣ POST /api/hr/gmail/emails/:id/ai

**Purpose:** Generate AI summary for an email

**Request:**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/emails/67abc123def456789012345/ai
```

**Response 200 (Summary Generated):**
```json
{
  "message": "AI summary generated",
  "aiSummary": {
    "summary": "Recruiter requesting review of candidate John Doe's resume for senior engineer position. Candidate has 8 years of backend development experience and has led major projects.",
    "key_points": [
      "Candidate: John Doe",
      "Position: Senior Engineer",
      "Experience: 8 years backend development",
      "Previous projects: Led major initiatives",
      "Recommendation: Strong candidate for technical interview"
    ],
    "action_items": [
      "Review attached resume in detail",
      "Check technical skills assessment",
      "Schedule technical interview if qualified",
      "Provide feedback to recruiter by Friday"
    ],
    "urgency": "high",
    "suggested_stage": "screening",
    "generatedAt": "2025-12-19T10:35:00.000Z"
  }
}
```

**Response 400 (Empty Email Body):**
```json
{
  "error": "Email body is empty; cannot generate summary"
}
```

**Response 404 (Email Not Found):**
```json
{
  "error": "Email not found"
}
```

**Response 503 (OpenAI Not Configured):**
```json
{
  "error": "OpenAI not configured",
  "message": "Missing OPENAI_API_KEY"
}
```

**Response 500 (OpenAI Error):**
```json
{
  "error": "Failed to generate summary",
  "details": "OpenAI API error: Rate limit exceeded"
}
```

---

## Common HTTP Status Codes

| Code | Meaning | Example Scenario |
|------|---------|------------------|
| 200 | Success | Email synced, list retrieved, summary generated |
| 400 | Bad Request | Email body is empty for summary |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User doesn't have HR/Admin role |
| 404 | Not Found | Email ID doesn't exist |
| 500 | Server Error | Database error, API error |
| 503 | Service Unavailable | Gmail or OpenAI not configured |

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Short error message",
  "message": "Longer explanation (optional)",
  "details": "Technical details (optional)"
}
```

**Examples:**

```json
// Simple error
{
  "error": "Unauthorized"
}

// Error with message
{
  "error": "Gmail not configured",
  "message": "Missing GOOGLE_REFRESH_TOKEN or credentials."
}

// Error with technical details
{
  "error": "Failed to sync emails",
  "details": "Connection timeout after 30s"
}
```

---

## Request Headers Required

All requests must include:

```
Authorization: Bearer <jwt-token>
Content-Type: application/json (for POST requests)
```

**Example:**
```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"label":"INBOX","maxResults":10}' \
  http://localhost:8000/api/hr/gmail/sync
```

---

## Data Types Reference

### Email Fields

```javascript
{
  _id: ObjectId,              // MongoDB document ID
  userId: ObjectId,           // HR user who synced
  gmailId: String,            // Gmail message ID (unique)
  threadId: String,           // Gmail thread ID
  from: String,               // Sender email address
  to: [String],               // Array of recipient emails
  cc: [String],               // CC recipients
  bcc: [String],              // BCC recipients
  subject: String,            // Email subject (default: "(no subject)")
  snippet: String,            // Preview text from Gmail
  body: String,               // Full email body text
  date: Date,                 // When sent (ISO string in JSON)
  internalDate: String,       // Gmail timestamp
  labelIds: [String],         // Gmail label IDs (e.g., ["INBOX", "IMPORTANT"])
  hasAttachments: Boolean,    // Whether email has attachments
  isRead: Boolean,            // Read status
  isStarred: Boolean,         // Starred status
  raw: String | null,         // Full RFC 2822 format (usually null)
  aiSummary: {
    summary: String,
    key_points: [String],
    action_items: [String],
    urgency: "low" | "medium" | "high",
    suggested_stage: "applied" | "screening" | "interview" | "offer" | "hired" | "rejected" | "unknown",
    generatedAt: Date
  } | null,
  lastModifiedTime: String,   // Gmail history ID
  syncedAt: Date,             // When added to MongoDB
  createdAt: Date,            // Document creation date
  updatedAt: Date,            // Last update date
  __v: Number                 // Version number
}
```

### Pagination Object

```javascript
{
  total: Number,      // Total documents matching query
  page: Number,       // Current page (1-indexed)
  limit: Number,      // Items per page
  pages: Number       // Total number of pages
}
```

---

## Testing with curl

### Get Gmail Status

```bash
TOKEN="eyJhbGc..."  # Get from login
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/hr/gmail/status
```

### Sync Emails

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"INBOX","maxResults":20}' \
  http://localhost:8000/api/hr/gmail/sync
```

### List Emails

```bash
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8000/api/hr/gmail/emails?page=1&limit=10'
```

### Get Email Details

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/hr/gmail/emails/67abc123/

### Generate Summary

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/hr/gmail/emails/67abc123/ai
```

---

## Quick Reference Card

**5 Endpoints Summary:**

```
GET    /status         → Check connection
POST   /sync           → Fetch from Gmail
GET    /emails         → List cached
GET    /emails/:id     → Get details
POST   /emails/:id/ai  → Generate summary
```

**Required Header:**
```
Authorization: Bearer <jwt-token>
```

**Common Statuses:**
```
200 = Success
400 = Bad request
401 = Not authenticated
403 = Not authorized (need HR/Admin)
404 = Not found
503 = Not configured (missing env vars)
500 = Server error
```

**AI Summary Response:**
```json
{
  "summary": "...",
  "key_points": ["...", "..."],
  "action_items": ["...", "..."],
  "urgency": "high|medium|low",
  "suggested_stage": "screening|interview|..."
}
```

---

This reference covers all possible responses from the Gmail integration endpoints!
