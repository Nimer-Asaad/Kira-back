# PDF Task Import & Auto-Distribution Feature

## Overview

This feature enables administrators to:
1. **Import tasks from PDF files** - Extract structured task data from PDF documents
2. **Auto-distribute tasks to employees** - Intelligently assign tasks based on specialization, skills, and workload

---

## Backend Implementation

### Models

#### User Model (Updated)
Added employee profile fields:
```javascript
{
  specialization: String (Frontend|Backend|AI|QA|DevOps|UI/UX|General),
  skills: [{ name: String, level: Number (1-5) }],
  maxConcurrentTasks: Number (default: 5),
  taskAssignmentNotes: [{ taskId, reason, assignedAt }]
}
```

#### Task Model (Updated)
- Changed `assignedTo` from array to single ObjectId reference
- Added `assignmentReason` field to track auto-distribution reasoning
- Field `source` tracks origin: "manual", "pdf", or "ai"

### Services

#### **pdfParsingService.js**
Handles PDF text extraction and task parsing with two approaches:

**Option 1: LLM-Based Extraction** (if OpenAI API key configured)
- Uses GPT to extract structured JSON from PDF text
- More intelligent, handles unstructured PDFs
- Falls back to rule-based if LLM fails

**Option 2: Rule-Based Extraction** (default/fallback)
- Parses patterns like:
  ```
  Task #1: Title
  Priority: High/Medium/Low
  Due Date: YYYY-MM-DD
  Description: ...
  TODO Checklist: 
  - item 1
  - item 2
  Attachments:
  - name: https://example.com/file
  ```

**Validation:**
- Title: required, min 3 characters
- Priority: normalized to "Low"/"Medium"/"High"
- Due Date: YYYY-MM-DD format
- Checklist: array of strings (max 20)
- Attachments: valid HTTP(S) URLs (max 10)

#### **taskDistributionService.js**
Implements intelligent task distribution algorithm:

**Specialization Mapping:**
- Keywords in title/description → specialization:
  - Frontend: react, vue, angular, javascript, css, html, ui
  - Backend: node, express, api, database, server, rest, graphql
  - AI: ai, ml, machine learning, deep learning, llm, gpt
  - QA: test, qa, automation, selenium, jest
  - DevOps: docker, kubernetes, ci/cd, deploy, aws
  - UI/UX: design, figma, mockup, wireframe

**Scoring Algorithm:**
```
score = 
  (specializationMatch ? 50 : 0)
  + sum(skillLevelMatch * 10)
  - (activeTaskCount * 12)
  - (overloadPenalty if activeTaskCount >= maxConcurrentTasks ? 100 : 0)
```

**Selection:**
1. Calculate score for all active employees
2. Sort by: highest score → lowest active count → highest avg skill level
3. Assign if score > -100 (reasonable threshold)

---

### Endpoints

#### **POST /api/tasks/import/pdf**
**Request:**
```
Content-Type: multipart/form-data
Field: file (PDF file)
```

**Response (201):**
```json
{
  "message": "PDF import completed",
  "createdCount": 5,
  "skippedCount": 2,
  "errors": [
    { "index": 0, "reason": "Title required and must be 3+ characters" },
    { "index": 3, "reason": "Invalid date format: 2024-13-45" }
  ],
  "createdTasks": [
    { "_id": "...", "title": "...", "priority": "high", "dueDate": "..." }
  ]
}
```

#### **POST /api/tasks/auto-distribute**
**Request Body (optional):**
```json
{
  "status": "pending"  // Filter tasks by status (default: pending)
}
```

**Response (200):**
```json
{
  "message": "Auto-distribution completed",
  "assignedCount": 5,
  "unassignedCount": 2,
  "totalTasks": 7,
  "assignments": [
    {
      "taskId": "...",
      "taskTitle": "Build React Dashboard",
      "employeeId": "...",
      "employeeName": "John Dev",
      "reason": "Matched specialization Frontend; matched skills: React(4), UI(3); workload: 2 active tasks"
    }
  ]
}
```

---

## Frontend Implementation

### Components

#### **PdfImportModal.jsx**
Modal dialog for PDF file upload with:
- File input (PDF only, max 10MB)
- Format instructions displayed in UI
- Success/error messaging with summary
- Loading state during import
- Auto-refresh task list on success

**Usage in ManagerTasks:**
```jsx
<PdfImportModal
  isOpen={showPdfImportModal}
  onClose={() => setShowPdfImportModal(false)}
  onImportSuccess={loadTasks}
/>
```

#### **AutoDistributeModal.jsx**
Modal for task distribution with:
- Status filter dropdown (Pending/In Progress/All)
- Distribution algorithm explanation
- Real-time progress display
- Results table showing:
  - Task title
  - Assigned employee name
  - Assignment reason/justification
- Auto-refresh task list on success

**Usage in ManagerTasks:**
```jsx
<AutoDistributeModal
  isOpen={showAutoDistributeModal}
  onClose={() => setShowAutoDistributeModal(false)}
  onDistributeSuccess={loadTasks}
/>
```

### Updated Pages

#### **ManagerTasks.jsx**
Added two buttons in header:
- **Import from PDF** (purple) - opens PdfImportModal
- **Auto Distribute** (green) - opens AutoDistributeModal

State management:
```javascript
const [showPdfImportModal, setShowPdfImportModal] = useState(false);
const [showAutoDistributeModal, setShowAutoDistributeModal] = useState(false);
```

### API Paths (apiPaths.js)
```javascript
TASK_IMPORT_PDF: `${API_BASE_URL}/tasks/import/pdf`,
TASK_AUTO_DISTRIBUTE: `${API_BASE_URL}/tasks/auto-distribute`,
```

---

## Usage Guide

### For Administrators

#### **Importing Tasks from PDF:**
1. Navigate to Admin → Manage Tasks
2. Click **"Import from PDF"** button
3. Select a PDF file (see format below)
4. Review import summary:
   - ✅ Created count
   - ⚠️ Skipped count
   - ❌ Errors with reasons
5. Tasks appear in task list with status "Pending"

#### **Auto-Distributing Tasks:**
1. Navigate to Admin → Manage Tasks
2. Click **"Auto Distribute"** button
3. Select status filter (default: "Pending")
4. System shows:
   - How many tasks will be distributed
   - Results table with employee names
   - Assignment reasoning for transparency
5. Tasks updated with `assignedTo` employee ID

#### **Viewing Assignment Reasoning:**
- Open task details modal
- Under "Assigned To" field, see assignment reason
- Example: `"Matched specialization Frontend; matched skills: React(4), UI(3); workload: 2 active tasks"`

---

## PDF Format Guide

Tasks are best extracted from PDFs with consistent structure:

### Recommended Format:
```
Task #1: Build User Dashboard
Priority: High
Due Date: 2024-01-15
Description: Create a responsive dashboard with charts and analytics
TODO Checklist:
- Design mockups
- Implement React components
- Connect to API
- Add unit tests
Attachments:
- Requirements: https://docs.example.com/requirements.pdf
- Mockups: https://figma.com/designs

Task #2: Refactor Database Schema
Priority: Medium
Due Date: 2024-02-20
Description: Optimize queries and normalize tables
...
```

### What Gets Parsed:
✅ Task title/description
✅ Priority (Low/Medium/High)
✅ Due dates (YYYY-MM-DD format)
✅ Checklist items
✅ Attachments (name + URL)

❌ NOT parsed: "Assign To" field (handled by auto-distribution)

### Parsing Flexibility:
- **Tolerant spacing:** Extra newlines, tabs, spaces are handled
- **Flexible priority:** "HIGH", "high", "H", "3" all work
- **Flexible dates:** Detects YYYY-MM-DD format
- **Optional sections:** Checklist and Attachments can be omitted

---

## Configuration

### Environment Variables
```env
# Optional: Enable OpenAI-based PDF extraction
OPENAI_API_KEY=sk-...

# Backend
NODE_ENV=development
MONGODB_URI=...
JWT_SECRET=...
```

### Employee Setup
For auto-distribution to work effectively, configure employee profiles:

1. Navigate to Team Members
2. Edit each employee to add:
   - **Specialization:** Frontend/Backend/AI/QA/DevOps/UI/UX/General
   - **Skills:** Add skill name + level (1-5)
   - **Max Concurrent Tasks:** Default 5

Example Employee Profile:
```javascript
{
  fullName: "John Developer",
  specialization: "Frontend",
  skills: [
    { name: "React", level: 4 },
    { name: "JavaScript", level: 5 },
    { name: "CSS", level: 3 }
  ],
  maxConcurrentTasks: 5,
  isActive: true
}
```

---

## Algorithm Details

### PDF Text Extraction
1. PDF buffer → pdf-parse → raw text
2. Remove metadata, handle encoding
3. Split into logical sections

### Rule-Based Parsing
1. Split by "Task #" patterns
2. Extract priority, date, description per task
3. Collect checklist items until next section marker
4. Collect attachments with URL validation

### LLM Parsing (Optional)
1. Send full PDF text to GPT-3.5-turbo
2. Request STRICT JSON output only
3. Parse JSON response
4. Fallback to rule-based if fails

### Task Validation
1. Check required fields (title min 3 chars)
2. Normalize priority to enum
3. Validate date format
4. Filter and validate URLs in attachments
5. Truncate long descriptions

### Auto-Distribution Algorithm
1. **Fetch all active employees** with their skills and specialization
2. **For each unassigned task:**
   - Map keywords from title/description → required specialization
   - Calculate score for each employee:
     ```
     score = specMatch(50) + skillMatch(0-50+) - workload(12*count) - overload(100)
     ```
   - Select employee with highest score
   - Generate human-readable reason
3. **Batch update** tasks with assignedTo and reason
4. **Return summary** with all assignments

---

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "No PDF file provided" | Missing file in request | Select file before upload |
| "File must be a PDF" | Wrong file type | Only .pdf files accepted |
| "PDF appears to be empty" | Unreadable/corrupted PDF | Try different PDF or OCR first |
| "No tasks could be extracted" | No matching pattern found | Check PDF format matches guide |
| "Invalid JSON from LLM" | OpenAI returned non-JSON | Falls back to rule-based parsing |
| "No active employees found" | No team members configured | Add employees first |
| Task not assigned | Score too low (< -100) | Check employee skills match |

---

## Best Practices

### For PDF Creation
✅ Use consistent section markers
✅ Keep dates in YYYY-MM-DD format  
✅ Use valid HTTP(S) URLs for attachments
✅ Keep titles clear and descriptive
✅ Use checklist for subtasks

### For Employee Management
✅ Set realistic specializations
✅ Rate skills honestly (1-5 scale)
✅ Update maxConcurrentTasks based on team capacity
✅ Keep employee skills updated as they grow

### For Task Distribution
✅ Run import first, then auto-distribute
✅ Review assignments before confirming
✅ Check assignment reasons for transparency
✅ Adjust employee skills if distribution is poor
✅ Monitor workload to prevent overload

---

## Dependencies

### Backend
- **pdf-parse**: Extract text from PDFs
- **multer**: Handle file uploads (already installed)
- **openai** (optional): LLM-based extraction

### Frontend
- React (already installed)
- Tailwind CSS (already installed)
- axiosInstance for API calls (already configured)

---

## Security Considerations

1. **File Upload Validation:**
   - File type checked (PDF only)
   - Size limited to 10MB via multer
   - Content-type validated

2. **Access Control:**
   - PDF import: Admin only (`protect`, `admin` middleware)
   - Auto-distribute: Admin only
   - Task viewing: Based on assignment

3. **Data Validation:**
   - All fields validated via schema
   - URLs checked to start with http(s)://
   - Dates validated for correctness

4. **Privacy:**
   - Assignment reasons stored but not sensitive
   - PDF text not persisted (only extracted tasks)
   - Audit trail via createdBy and timestamps

---

## Future Enhancements

- [ ] **Batch PDF upload:** Import multiple PDFs at once
- [ ] **Task templates:** Save recurring task patterns
- [ ] **Assignment history:** Track who assigned tasks and why
- [ ] **Skill matching ML:** ML-based skill requirement detection
- [ ] **Workload balancing:** Spread work more evenly
- [ ] **Notifications:** Alert employees of new assignments
- [ ] **Two-stage distribution:** Preview before confirming
- [ ] **Undo distribution:** Rollback auto-distribution
- [ ] **WebSocket updates:** Real-time distribution progress

---

## Testing

### Manual Testing Checklist

**PDF Import:**
- [ ] Upload valid PDF with tasks
- [ ] Verify created count matches tasks
- [ ] Check error items display with reasons
- [ ] Verify tasks appear in task list
- [ ] Test with malformed PDF (should fail gracefully)
- [ ] Test with 10MB file (max size)

**Auto-Distribution:**
- [ ] Set up employees with specializations
- [ ] Add employees with various skill levels
- [ ] Create unassigned pending tasks
- [ ] Click auto-distribute
- [ ] Verify all tasks assigned or reason shown
- [ ] Check assignment reasons are sensible
- [ ] Test with no active employees (should show message)

**Integration:**
- [ ] Import 10 tasks from PDF
- [ ] Auto-distribute them
- [ ] Verify employees see new tasks in My Tasks
- [ ] Open task details, see assignment reason
- [ ] Reassign task manually, verify it works

---

## API Response Examples

### Import Success
```json
{
  "message": "PDF import completed",
  "createdCount": 8,
  "skippedCount": 1,
  "errors": [
    {
      "index": 5,
      "reason": "Title required and must be 3+ characters"
    }
  ],
  "createdTasks": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Design API Endpoints",
      "priority": "high",
      "dueDate": "2024-02-15T00:00:00.000Z"
    },
    ...
  ]
}
```

### Distribution Success
```json
{
  "message": "Auto-distribution completed",
  "assignedCount": 8,
  "unassignedCount": 1,
  "totalTasks": 9,
  "assignments": [
    {
      "taskId": "507f1f77bcf86cd799439011",
      "taskTitle": "Design API Endpoints",
      "employeeId": "507f1f77bcf86cd799439012",
      "employeeName": "Alice Backend Dev",
      "reason": "Matched specialization Backend; matched skills: Node.js(4), API Design(3); workload: 2 active tasks"
    },
    ...
  ]
}
```

---

## Troubleshooting

### "TypeError: pdf-parse is not a function"
**Solution:** Verify package.json has pdf-parse, run `npm install`

### Tasks imported but Auto-Distribute shows "No unassigned tasks"
**Check:**
- Tasks have `assignedTo: null`
- Status filter matches task status
- Query not filtering out imported tasks

### Auto-Distribute assigns all tasks to same employee
**Likely:** Only one active employee or poor skill matching
**Fix:** Add more employees or update skills profile

### LLM extraction fails silently
**Check:**
- OPENAI_API_KEY is set
- API key has valid quota
- Check backend logs for LLM error
- Verify fallback to rule-based parsing works

---

## Performance Notes

- **PDF parsing:** ~1-5 seconds for 10-page PDF
- **Auto-distribution:** ~500ms-1s for 100 tasks
- **Database:** Bulk insert optimized with `insertMany`
- **Scaling:** Algorithm O(employees × tasks), suitable for teams <1000

---

## Support & Questions

For issues:
1. Check this documentation
2. Review error messages in UI
3. Check backend logs for details
4. Verify employee profiles are configured
5. Test with sample PDF from examples folder
