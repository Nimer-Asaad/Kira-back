# Gmail Integration Quick Start Guide

## What Was Added

A complete Gmail integration for the Kira HR module enabling HR/Admin users to:
- ✅ Connect to Gmail via OAuth (refresh token mode)
- ✅ Sync emails into MongoDB
- ✅ List/search emails with pagination
- ✅ View email details
- ✅ Generate AI summaries of emails

## 5 Backend API Endpoints

All require HR/Admin role + JWT auth:

```
GET  /api/hr/gmail/status              → Connection check
POST /api/hr/gmail/sync               → Sync from Gmail
GET  /api/hr/gmail/emails             → List cached emails
GET  /api/hr/gmail/emails/:id         → Get one email
POST /api/hr/gmail/emails/:id/ai      → AI summary
```

## What You Need To Do

### 1. Get Google Credentials (5 min)

1. Go to https://console.cloud.google.com/
2. Create a project → "Kira"
3. Enable Gmail API (search for "Gmail API")
4. Create OAuth 2.0 credentials:
   - Type: Desktop application
   - Download JSON file
   - Copy: Client ID, Client Secret
5. Generate refresh token using [Google OAuth Playground](https://developers.google.com/oauthplayground)
   - Select "Gmail API v1" → all scopes
   - Authorize → Exchange code for token
   - Copy: refresh_token

### 2. Update .env (2 min)

```env
GOOGLE_CLIENT_ID=your-client-id-from-step-1
GOOGLE_CLIENT_SECRET=your-client-secret-from-step-1
GOOGLE_REDIRECT_URI=http://localhost:8000/api/gmail/callback
GOOGLE_REFRESH_TOKEN=your-refresh-token-from-step-5

# Already configured:
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

### 3. Verify Server (1 min)

```bash
cd Kira-Backend
npm run dev
# Should see: "Server running on port 8000"
```

### 4. Test Endpoints (5 min)

Get a valid HR/Admin JWT token first:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kira.com","password":"password"}'
# Copy the token from response
```

Then test the Gmail endpoints:
```bash
# Check connection
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/status

# Sync emails
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"label":"INBOX","maxResults":10}' \
  http://localhost:8000/api/hr/gmail/sync

# List emails
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/hr/gmail/emails?page=1&limit=20

# Or use the test script:
node test-gmail.js <token>
```

## File Structure

```
Kira-Backend/
├── models/
│   ├── Email.js                    (new - email storage)
│   └── SyncState.js               (new - sync tracking)
├── services/
│   ├── gmailClient.js             (new - Gmail API wrapper)
│   └── openaiClient.js            (existing - AI service)
├── controllers/
│   └── hrGmailController.js        (new - all 5 endpoints)
├── routes/
│   └── hrGmailRoutes.js           (new - route definitions)
├── server.js                       (updated - routes registered)
├── package.json                    (updated - added googleapis)
├── .env                            (updated - Gmail vars)
├── GMAIL_INTEGRATION.md            (new - full documentation)
├── GMAIL_IMPLEMENTATION_SUMMARY.md (new - technical summary)
└── test-gmail.js                   (new - test script)
```

## Frontend (Next Steps)

Add these to `src/utils/apiPaths.js` (already done):
```javascript
HR_GMAIL_STATUS: `${API_BASE_URL}/hr/gmail/status`,
HR_GMAIL_SYNC: `${API_BASE_URL}/hr/gmail/sync`,
HR_GMAIL_EMAILS: `${API_BASE_URL}/hr/gmail/emails`,
HR_GMAIL_EMAIL_BY_ID: (id) => `${API_BASE_URL}/hr/gmail/emails/${id}`,
HR_GMAIL_EMAIL_AI_SUMMARY: (id) => `${API_BASE_URL}/hr/gmail/emails/${id}/ai`,
```

Build React components:
- `pages/HR/Gmail.jsx` - Main page
- `components/GmailSync.jsx` - Sync button
- `components/GmailList.jsx` - Email list
- `components/GmailDetail.jsx` - Email viewer
- `components/GmailSummary.jsx` - AI summary display

## API Response Examples

### ✅ Status Check
```json
{
  "status": "connected",
  "lastSync": "2025-12-19T10:30:00Z",
  "syncedCount": 45,
  "totalMessages": 150
}
```

### ✅ Sync Emails
```json
{
  "message": "Sync completed",
  "syncedCount": 10,
  "totalMessages": 250,
  "hasMore": true
}
```

### ✅ List Emails
```json
{
  "emails": [{
    "_id": "67...",
    "from": "recruiter@example.com",
    "subject": "Resume Review",
    "snippet": "Hi, please review...",
    "date": "2025-12-19T09:15:00Z",
    "isRead": true,
    "aiSummary": null
  }],
  "pagination": {
    "total": 125,
    "page": 1,
    "limit": 20,
    "pages": 7
  }
}
```

### ✅ AI Summary
```json
{
  "aiSummary": {
    "summary": "Recruiter requesting review of John Doe's resume for senior engineer position",
    "key_points": ["Candidate: John Doe", "Position: Senior Engineer"],
    "action_items": ["Review resume", "Schedule interview"],
    "urgency": "high",
    "suggested_stage": "screening",
    "generatedAt": "2025-12-19T10:35:00Z"
  }
}
```

## Error Responses

### ❌ Gmail Not Configured (503)
```json
{
  "status": "not_configured",
  "message": "Gmail not configured. Missing GOOGLE_REFRESH_TOKEN or credentials."
}
```
**Fix:** Add GOOGLE_REFRESH_TOKEN to .env

### ❌ Unauthorized (401)
```json
{
  "error": "Unauthorized"
}
```
**Fix:** Include valid JWT token in Authorization header

### ❌ Forbidden (403)
```json
{
  "error": "Not authorized as HR or Admin"
}
```
**Fix:** User must have HR or Admin role

### ❌ OpenAI Not Configured (503)
```json
{
  "error": "OpenAI not configured",
  "message": "Missing OPENAI_API_KEY"
}
```
**Fix:** Verify OPENAI_API_KEY in .env

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 503 Gmail not configured | Add GOOGLE_REFRESH_TOKEN to .env |
| 401 Unauthorized | Include JWT token in Authorization header |
| 403 Forbidden | Ensure user has HR/Admin role |
| Gmail API errors | Check token not expired, Gmail API enabled in Google Cloud |
| AI summary fails | Verify OPENAI_API_KEY is valid, email has readable body |

## Architecture Overview

```
┌─────────────────┐
│  React Frontend │
└────────┬────────┘
         │ (JWT Token)
         ↓
┌──────────────────────────┐
│  Express API             │
│  /api/hr/gmail/*         │
└────────┬─────────────────┘
         │
    ┌────┴─────┬─────────────┐
    ↓          ↓             ↓
┌────────┐ ┌──────────┐ ┌───────────┐
│MongoDB │ │Gmail API │ │OpenAI API │
│(cache) │ │(sync)    │ │(summary)  │
└────────┘ └──────────┘ └───────────┘
```

## Key Features

✅ **Role-Based Security** - HR/Admin only  
✅ **OAuth Ready** - Uses refresh token (demo mode)  
✅ **Email Caching** - Store in MongoDB for fast access  
✅ **AI Summaries** - Auto-summarize emails  
✅ **Pagination** - Efficient list loading  
✅ **Search/Filter** - Find emails by subject/from/label  
✅ **Error Handling** - Graceful 503 if not configured  
✅ **Rate Limited** - Use Gmail API efficiently  

## Environment Variables Needed

```env
# Gmail (from Google Cloud Console)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx

# OpenAI (already have)
OPENAI_API_KEY=sk-proj-xxx
```

## Documentation Files

- `GMAIL_INTEGRATION.md` - Full API documentation with examples
- `GMAIL_IMPLEMENTATION_SUMMARY.md` - Technical architecture & checklist
- `test-gmail.js` - Auto-test script

## Testing Checklist

- [ ] Gmail credentials added to .env
- [ ] Server starts without errors
- [ ] Can login as HR/Admin user
- [ ] GET /status returns "connected" or 503
- [ ] POST /sync syncs emails successfully
- [ ] GET /emails lists cached emails
- [ ] GET /emails/:id shows email details
- [ ] POST /emails/:id/ai generates summary

## Next: Build Frontend

1. Create `src/pages/HR/Gmail.jsx`
2. Add Gmail link to HR menu
3. Build components for sync, list, detail, summary
4. Use `axiosInstance` with JWT token
5. Call API paths from `apiPaths.js`

---

**Ready to test?**
```bash
npm run dev              # Start server
node test-gmail.js <token>  # Test all endpoints
```

**Questions?** See `GMAIL_INTEGRATION.md` for complete documentation.
