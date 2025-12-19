# Gmail Integration - Kira HR Module

This document describes the Gmail integration for the Kira HR module, enabling HR/Admin users to sync emails, cache them in MongoDB, and generate AI summaries.

## Overview

The Gmail integration provides:
- OAuth 2.0 authentication with Google
- Demo mode using refresh tokens
- Email syncing from Gmail to MongoDB
- Email list with pagination and filtering
- AI-powered email summarization
- HR/Admin role-based access control

## Environment Setup

### Prerequisites
1. Google Cloud Project with Gmail API enabled
2. OAuth 2.0 credentials (Client ID, Client Secret)
3. Refresh token (for demo/service account mode)
4. OpenAI API key (for email summaries)

### Environment Variables

Add these to your `.env` file:

```env
# Gmail Configuration
GOOGLE_CLIENT_ID=your-client-id-from-google-cloud
GOOGLE_CLIENT_SECRET=your-client-secret-from-google-cloud
GOOGLE_REDIRECT_URI=http://localhost:8000/api/gmail/callback
GOOGLE_REFRESH_TOKEN=your-refresh-token-here

# OpenAI (required for email summarization)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

### Getting Google Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Desktop application)
5. Download JSON credentials
6. Generate a refresh token (use OAuth 2.0 Playground or library)

## API Endpoints

All endpoints require:
- Authentication (JWT token in `Authorization` header)
- HR/Admin role

Base URL: `/api/hr/gmail`

### 1. Check Gmail Connection Status

```http
GET /api/hr/gmail/status
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "status": "connected",
  "lastSync": "2025-12-19T10:30:00Z",
  "syncedCount": 45,
  "totalMessages": 150
}
```

**Response (503 - Not Configured):**
```json
{
  "status": "not_configured",
  "message": "Gmail not configured. Missing GOOGLE_REFRESH_TOKEN or credentials."
}
```

### 2. Sync Emails from Gmail

```http
POST /api/hr/gmail/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "label": "INBOX",
  "maxResults": 10
}
```

**Parameters:**
- `label` (string): Gmail label ID (INBOX, IMPORTANT, STARRED, SENT, DRAFT, etc.) - default: INBOX
- `maxResults` (number): Number of emails to fetch - default: 10

**Response (200):**
```json
{
  "message": "Sync completed",
  "syncedCount": 10,
  "totalMessages": 250,
  "hasMore": true
}
```

**What it does:**
- Fetches latest N emails from specified label
- Downloads full message details (headers, body, attachments info)
- Stores emails in MongoDB (upsert by gmailId)
- Tracks pagination state for resuming sync

### 3. List Cached Emails

```http
GET /api/hr/gmail/emails?q=resume&label=INBOX&page=1&limit=20
Authorization: Bearer <token>
```

**Query Parameters:**
- `q` (string): Search in subject or from field - optional
- `label` (string): Gmail label ID - optional (default: ALL)
- `page` (number): Page number - optional (default: 1)
- `limit` (number): Items per page - optional (default: 20)

**Response (200):**
```json
{
  "emails": [
    {
      "_id": "67...",
      "gmailId": "18c...",
      "from": "recruiter@example.com",
      "to": ["hr@kira.com"],
      "subject": "Resume Review - John Doe",
      "snippet": "Hi, please review this candidate...",
      "date": "2025-12-19T09:15:00Z",
      "labelIds": ["INBOX"],
      "isRead": true,
      "isStarred": false,
      "hasAttachments": true,
      "aiSummary": null,
      "syncedAt": "2025-12-19T10:30:00Z"
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

### 4. Get Email Details

```http
GET /api/hr/gmail/emails/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "_id": "67...",
  "gmailId": "18c...",
  "threadId": "18c...",
  "from": "recruiter@example.com",
  "to": ["hr@kira.com"],
  "cc": ["manager@kira.com"],
  "subject": "Resume Review",
  "snippet": "Hi, please review...",
  "body": "Full email body text...",
  "date": "2025-12-19T09:15:00Z",
  "internalDate": "1766200500000",
  "labelIds": ["INBOX", "IMPORTANT"],
  "hasAttachments": true,
  "isRead": true,
  "isStarred": false,
  "aiSummary": null,
  "lastModifiedTime": "18..."
}
```

### 5. Generate AI Summary for Email

```http
POST /api/hr/gmail/emails/:id/ai
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "AI summary generated",
  "aiSummary": {
    "summary": "Recruiter is requesting review of candidate John Doe's resume for senior engineer position.",
    "key_points": [
      "Candidate: John Doe",
      "Position: Senior Engineer",
      "Status: Pending review"
    ],
    "action_items": [
      "Review attached resume",
      "Schedule interview if qualified",
      "Provide feedback by Friday"
    ],
    "urgency": "high",
    "suggested_stage": "screening",
    "generatedAt": "2025-12-19T10:35:00Z"
  }
}
```

**Response (400 - Empty Body):**
```json
{
  "error": "Email body is empty; cannot generate summary"
}
```

**Response (503 - OpenAI Not Configured):**
```json
{
  "error": "OpenAI not configured",
  "message": "Missing OPENAI_API_KEY"
}
```

## Data Models

### Email Schema

```javascript
{
  userId: ObjectId,              // HR/Admin user who synced
  gmailId: String,               // Gmail message ID (unique)
  threadId: String,              // Gmail thread ID
  from: String,                  // Sender email
  to: [String],                  // Recipients
  cc: [String],                  // CC recipients
  bcc: [String],                 // BCC recipients
  subject: String,               // Email subject
  snippet: String,               // Preview text
  body: String,                  // Full email body
  date: Date,                    // Sent date
  internalDate: String,          // Gmail internal timestamp
  labelIds: [String],            // Gmail label IDs
  hasAttachments: Boolean,       // Attachment indicator
  isRead: Boolean,               // Read status
  isStarred: Boolean,            // Star status
  raw: String,                   // Full RFC 2822 format (optional)
  aiSummary: {
    summary: String,
    key_points: [String],
    action_items: [String],
    urgency: "low|medium|high",
    suggested_stage: String,
    generatedAt: Date
  },
  lastModifiedTime: String,      // Gmail history ID
  syncedAt: Date,                // When synced to DB
  createdAt: Date,
  updatedAt: Date
}
```

### SyncState Schema

```javascript
{
  userId: ObjectId,              // HR/Admin user
  scope: String,                 // Gmail label (INBOX, IMPORTANT, etc.)
  pageToken: String,             // Pagination token for next sync
  lastSyncedAt: Date,            // Last successful sync
  totalMessages: Number,         // Total messages in label
  syncedCount: Number,           // Total synced to DB
  createdAt: Date,
  updatedAt: Date
}
```

## Usage Examples

### Example 1: Check if Gmail is Connected

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/status
```

### Example 2: Sync Latest 20 Inbox Emails

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"label": "INBOX", "maxResults": 20}' \
  http://localhost:8000/api/hr/gmail/sync
```

### Example 3: List Emails with Search

```bash
curl -H "Authorization: Bearer <token>" \
  'http://localhost:8000/api/hr/gmail/emails?q=candidate&label=INBOX&page=1&limit=10'
```

### Example 4: Generate Summary for Email

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/emails/67abc123/ai
```

## Error Handling

### Common Errors

| Error | Status | Cause | Fix |
|-------|--------|-------|-----|
| Gmail not configured | 503 | Missing env vars | Add GOOGLE_REFRESH_TOKEN and credentials |
| OpenAI not configured | 503 | Missing OPENAI_API_KEY | Add valid API key to .env |
| Email not found | 404 | Invalid email ID | Check email exists in cache |
| Email body empty | 400 | No text content in email | Email must have readable body |
| Unauthorized | 401 | Missing/invalid token | Provide valid JWT token |
| Forbidden | 403 | Not HR/Admin role | Only HR/Admin can access |

## Workflow Example

### Typical HR Daily Routine

1. **Check Connection**
   ```
   GET /api/hr/gmail/status
   ```

2. **Sync New Inbox Emails**
   ```
   POST /api/hr/gmail/sync
   Body: { "label": "INBOX", "maxResults": 50 }
   ```

3. **Browse Recent Emails**
   ```
   GET /api/hr/gmail/emails?page=1&limit=20
   ```

4. **Review Specific Email**
   ```
   GET /api/hr/gmail/emails/:id
   ```

5. **Get AI Summary**
   ```
   POST /api/hr/gmail/emails/:id/ai
   ```

6. **Search for Emails**
   ```
   GET /api/hr/gmail/emails?q=John&label=INBOX
   ```

## Demo Setup (Without OAuth)

For development/demo purposes, use the refresh token approach:

1. Generate a refresh token using [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
2. Add to `.env`:
   ```env
   GOOGLE_REFRESH_TOKEN=1//0g...
   ```
3. Server will automatically use this token for all requests
4. No login/connect flow needed

## Frontend Integration

### Suggested API Paths (Frontend)

Add to `src/utils/apiPaths.js`:

```javascript
// Gmail endpoints
HR_GMAIL_STATUS: () => `/api/hr/gmail/status`,
HR_GMAIL_SYNC: () => `/api/hr/gmail/sync`,
HR_GMAIL_EMAILS: () => `/api/hr/gmail/emails`,
HR_GMAIL_EMAIL_BY_ID: (id) => `/api/hr/gmail/emails/${id}`,
HR_GMAIL_EMAIL_AI_SUMMARY: (id) => `/api/hr/gmail/emails/${id}/ai`,
```

### Suggested React Component Structure

```
src/pages/HR/
  ├─ Gmail.jsx (main page)
  ├─ GmailStatus.jsx (connection status)
  ├─ GmailSync.jsx (sync button + progress)
  ├─ GmailEmailList.jsx (pagination + search)
  ├─ GmailEmailDetail.jsx (view single email)
  └─ GmailEmailSummary.jsx (AI summary display)
```

## Troubleshooting

### Gmail Not Configured
- Check `.env` has `GOOGLE_REFRESH_TOKEN`
- Verify token is not expired (refresh from Google Console)

### Sync Failing
- Ensure Gmail API is enabled in Google Cloud Project
- Check refresh token is valid
- Verify user account has Gmail access

### AI Summary Fails
- Confirm `OPENAI_API_KEY` is valid and has available quota
- Check email has readable text body
- Verify API key hasn't reached usage limits

### MongoDB Connection Issues
- Check `MONGO_URI` in `.env`
- Ensure network IP whitelist on MongoDB Atlas
- Verify database user permissions

## Future Enhancements

- [ ] OAuth 2.0 full flow (login button)
- [ ] Automatic sync scheduler (every 15 min)
- [ ] Email categories/custom labels
- [ ] Reply/forward composition
- [ ] Attachment preview
- [ ] Email templates for HR responses
- [ ] Export summaries to PDF
- [ ] Email forwarding to candidates

## Security Notes

- All endpoints require HR/Admin authorization
- Refresh tokens should be rotated regularly
- Store sensitive data in `.env`, never commit
- Email bodies are stored in MongoDB; consider encryption
- Raw email data not stored by default (can enable)

## Support

For issues or questions about Gmail integration:
1. Check error status code and message
2. Review this documentation
3. Check server logs for detailed errors
4. Verify all env variables are set
5. Test Gmail API directly using Google Console
