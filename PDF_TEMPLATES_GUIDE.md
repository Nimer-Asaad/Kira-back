# Sample PDF Task Format Templates

This guide shows example PDF formats that work well with the PDF import feature.

## Template 1: Simple Structured Format (RECOMMENDED)

```
TASK #1: Build User Authentication System
Priority: High
Due Date: 2024-02-20
Description: Implement secure user authentication with JWT tokens and password hashing. Should support login, signup, and logout flows with proper error handling.
TODO Checklist:
- Create User model with validation
- Implement password hashing with bcrypt
- Build authentication routes
- Add JWT token generation
- Create middleware for protected routes
- Write unit tests
Attachments:
- API Specification: https://docs.example.com/auth-api-spec
- Design: https://figma.com/file/auth-design


TASK #2: Create Product Dashboard
Priority: Medium
Due Date: 2024-03-01
Description: Build an admin dashboard for managing products. Include product listing, filtering, search, and CRUD operations.
TODO Checklist:
- Design dashboard layout
- Implement product table with pagination
- Add search and filter functionality
- Build edit/delete modals
- Integrate with backend API
- Add loading and error states
Attachments:
- Wireframes: https://example.com/wireframes.pdf


TASK #3: Database Migration & Optimization
Priority: High
Due Date: 2024-02-15
Description: Migrate from MySQL to MongoDB and optimize query performance. Should include index creation and query analysis.
TODO Checklist:
- Analyze current schema
- Design MongoDB collections
- Write migration scripts
- Create necessary indexes
- Test query performance
- Document migration guide
Attachments: -


TASK #4: QA Testing Phase 1
Priority: Medium
Due Date: 2024-02-28
Description: Test all user-facing features for bugs, performance, and accessibility. Create detailed test reports.
TODO Checklist:
- Test authentication flow
- Test dashboard functionality
- Performance testing
- Accessibility testing
- Create test report
Attachments:
- Test Plan: https://docs.example.com/test-plan.pdf
```

## Template 2: Minimal Format (Works too, less detail)

```
Task #1: Implement Payment Gateway
Priority: High
Due Date: 2024-03-10
Description: Integrate Stripe payment processing for subscription and one-time payments.

Task #2: API Rate Limiting
Priority: Medium
Due Date: 2024-03-15
Description: Add rate limiting middleware to prevent abuse.

Task #3: Email Notifications
Priority: Low
Due Date: 2024-03-20
Description: Send transactional emails for account activities.
```

## Template 3: With Detailed Requirements

```
===== TASK #1 =====
Title: Build Notification System
Priority: High
Deadline: 2024-02-28
Overview: Create a real-time notification system that supports in-app notifications, email, and SMS with user preferences.

Details:
The system should support multiple notification channels (in-app, email, SMS), with user preference settings. Notifications should be queued for reliability and include retry logic for failed deliveries.

Sub-tasks:
• Design notification schema and models
• Build notification service with queuing
• Create email template system
• Implement SMS integration (Twilio)
• Add notification preferences UI
• Write comprehensive tests
• Document API endpoints

Related Files:
• Requirements: https://docs.example.com/notifications-requirements
• Design: https://figma.com/notifications-ui
• API Mock: https://mockapi.example.com/notifications

===== TASK #2 =====
[Continue similar format...]
```

## Template 4: Markdown-Style Format (Also works)

```
# Task Management System Implementation

## Task 1: Backend API Development
- **Priority:** High
- **Due:** 2024-02-25
- **Description:** Develop RESTful API for task management with full CRUD operations

### Checklist:
- [ ] Create Task model
- [ ] Build API endpoints (GET, POST, PUT, DELETE)
- [ ] Implement validation
- [ ] Add error handling
- [ ] Create database indexes
- [ ] Write API documentation

### Files:
- API Docs: https://docs.example.com/api-docs
- Database Schema: https://example.com/db-schema.pdf

## Task 2: Frontend UI Implementation
- **Priority:** High
- **Due:** 2024-03-05
- **Description:** Build React components for task management interface

### Checklist:
- [ ] Create task list component
- [ ] Build task form modal
- [ ] Add filtering and sorting
- [ ] Implement responsive design
- [ ] Add animations
- [ ] Test on mobile devices
```

## Key Rules for PDF Compatibility

### ✅ WORKS WELL:
- **Clear section headers:** "Task #X:", "Priority:", "Due Date:"
- **Consistent formatting:** Same structure for each task
- **Simple checklist markers:** "- item" or "• item"
- **Proper date format:** YYYY-MM-DD
- **Full URLs in attachments:** Starting with http:// or https://
- **Separation between tasks:** Empty line or task number marker

### ❌ MIGHT NOT WORK:
- PDF scans/images (need OCR first)
- Complex nested formatting
- Tables without clear section markers
- Relative URLs (URLs without http/https)
- Mix of date formats (DD/MM/YYYY vs YYYY-MM-DD)
- Very long descriptions (won't break, but may lose detail)

### 🤔 AMBIGUOUS (Parser tries but may skip):
- "Assigned To" field (not parsed - handled by auto-distribute)
- Custom fields not in standard template
- Tasks without clear title
- Missing priority (defaults to Medium)

---

## Export Tips from Common Tools

### From Microsoft Word:
1. File → Export As → PDF
2. Ensure text is searchable (not image-based)
3. Keep formatting simple (avoid complex styling)

### From Google Docs:
1. File → Download → PDF Document
2. Use Heading styles for task titles
3. Use bullet lists for checklist items

### From Notion:
1. Click "..." → Export → PDF (Markdown format)
2. Structure pages with H2 for tasks
3. Use checkbox lists for checklist items

### From Jira Export:
1. Filter issues needed
2. Tools → Export Issues → PDF
3. May need manual formatting for compatibility

### From Confluence:
1. Space Tools → Export → PDF
2. Edit to match template structure
3. Remove unnecessary navigation elements

---

## Testing Your PDF Format

Before uploading, ensure your PDF:

1. **Is readable:**
   ```bash
   # On Mac/Linux, test extraction
   pdftotext your-file.pdf - | head -50
   ```

2. **Has searchable text:**
   - Not an image/scan
   - Can copy-paste text from PDF

3. **Contains expected sections:**
   - At least one "Task" marker
   - Titles with 3+ characters
   - At least description or checklist

4. **Has valid dates (if present):**
   - Format: 2024-02-15
   - Year-Month-Day

5. **Has valid URLs (if present):**
   - Start with http:// or https://

---

## Common Parsing Scenarios

### Scenario 1: Perfect Import
```
Input PDF:
  Task #1: Build API
  Priority: High
  Due Date: 2024-02-20
  Description: Create REST endpoints
  
Result:
  ✅ Task created: "Build API"
  Status: Pending
  Priority: high
  Due: 2024-02-20
```

### Scenario 2: Partial Import (Missing sections)
```
Input PDF:
  Task #1: Build API
  Description: Create REST endpoints
  
Result:
  ✅ Task created with defaults:
  Status: Pending (default)
  Priority: Medium (default)
  Due: null (optional)
```

### Scenario 3: Skipped Task (Validation fails)
```
Input PDF:
  Task #1: B2  [too short - min 3 chars]
  Priority: Super-High  [invalid priority]
  Due Date: Feb 20  [invalid date format]
  
Result:
  ❌ Skipped: "Title required and must be 3+ characters; Invalid priority value"
```

### Scenario 4: Flexible Date Parsing
```
Input PDF:
  Due Date: 2024-02-20
  Due Date: Feb 20, 2024
  Due Date: 20/02/2024
  
Result:
  ✅ Only YYYY-MM-DD (2024-02-20) parsed
  ⚠️ Others skipped with error reason
```

### Scenario 5: Attachment Validation
```
Input PDF:
  Attachments:
  - Design: https://figma.com/file123
  - Notes: notepad.txt  [no http]
  - Docs: htttp://example.com  [typo in http]
  
Result:
  ✅ figma.com attachment included
  ❌ notepad.txt skipped (no http)
  ❌ htttp://... skipped (invalid)
```

---

## Example: Real-World Project Tasks PDF

```
# Q1 2024 Project: E-Commerce Platform

TASK #1: Setup Development Environment
Priority: High
Due Date: 2024-01-05
Description: Initialize project repositories, setup CI/CD pipeline, and configure development tools. This includes Docker setup for local development and GitHub Actions for automated testing.
TODO Checklist:
- Create GitHub repositories
- Setup Docker and docker-compose
- Configure ESLint and Prettier
- Setup GitHub Actions workflow
- Create development documentation
- Setup environment variables template
Attachments:
- DevOps Guide: https://confluence.example.com/devops-guide
- Docker Compose Template: https://github.com/example/docker-template

TASK #2: Database Schema Design
Priority: High
Due Date: 2024-01-10
Description: Design MongoDB collections for users, products, orders, and payments. Include proper indexing strategy for performance and data validation rules.
TODO Checklist:
- Design user collection with roles
- Design product catalog schema
- Design order and order items schema
- Design payment history schema
- Create migration scripts
- Write schema documentation
- Optimize indexes
Attachments:
- Database Design Doc: https://docs.example.com/db-design
- ER Diagram: https://example.com/er-diagram.png

TASK #3: User Authentication & Authorization
Priority: High
Due Date: 2024-01-20
Description: Implement JWT-based authentication with role-based access control. Support login, signup, password reset, and 2FA.
TODO Checklist:
- Create authentication endpoints
- Implement JWT token generation
- Add password hashing (bcrypt)
- Create role-based middleware
- Implement refresh token logic
- Add email verification
- Setup password reset flow
- Write authentication tests
Attachments:
- Auth Requirements: https://docs.example.com/auth-requirements
- Security Guidelines: https://docs.example.com/security

TASK #4: Product Catalog API
Priority: High
Due Date: 2024-02-01
Description: Build API endpoints for product management including listing, searching, filtering, and pagination.
TODO Checklist:
- Create product routes
- Implement search functionality
- Add filtering by category, price, rating
- Implement pagination
- Add caching layer (Redis)
- Create product validation
- Write comprehensive tests
Attachments:
- API Spec: https://docs.example.com/api-spec

TASK #5: Shopping Cart & Checkout
Priority: High
Due Date: 2024-02-15
Description: Implement shopping cart functionality with checkout flow including payment processing.
TODO Checklist:
- Design cart data structure
- Create cart management endpoints
- Implement checkout flow
- Integrate payment gateway (Stripe)
- Add order creation logic
- Implement order confirmation email
- Add payment error handling
Attachments:
- Checkout Flow: https://figma.com/checkout-flow
- Payment Integration Guide: https://stripe.com/docs

TASK #6: Admin Dashboard
Priority: Medium
Due Date: 2024-03-01
Description: Build admin panel for managing products, orders, users, and analytics with charts and reports.
TODO Checklist:
- Design dashboard layout
- Implement product management UI
- Build order management views
- Create user management section
- Add analytics dashboard
- Implement reporting features
- Add export functionality
Attachments:
- Design Mockups: https://figma.com/admin-dashboard
- Requirements: https://docs.example.com/admin-requirements

TASK #7: Performance Optimization
Priority: Medium
Due Date: 2024-03-10
Description: Optimize database queries, implement caching, and reduce API response times below 200ms.
TODO Checklist:
- Analyze slow queries
- Add database indexes
- Implement Redis caching
- Optimize API endpoints
- Enable gzip compression
- Setup CDN for static assets
- Load testing
- Document optimization strategies
Attachments:
- Performance Guide: https://docs.example.com/performance

TASK #8: QA & Testing
Priority: High
Due Date: 2024-03-15
Description: Comprehensive testing including unit tests, integration tests, and end-to-end tests. Achieve 80% code coverage.
TODO Checklist:
- Write unit tests for utilities
- Create integration tests
- Setup E2E testing with Playwright
- Create test scenarios
- Performance testing
- Security testing
- Create test report
- Fix identified bugs
Attachments:
- Test Plan: https://docs.example.com/test-plan
- Test Scenarios: https://docs.example.com/test-scenarios

TASK #9: Documentation & Deployment
Priority: Medium
Due Date: 2024-03-20
Description: Create comprehensive documentation and deploy to production with monitoring setup.
TODO Checklist:
- Write API documentation
- Create user guide
- Write deployment guide
- Setup monitoring and logging
- Configure alerts
- Create runbook
- Deploy to staging
- Deploy to production
Attachments:
- Doc Template: https://docs.example.com/template
- Deployment Checklist: https://docs.example.com/deploy-checklist
```

---

## Tips for Maximum Success

1. **Keep tasks focused:** One task per function, not multiple
2. **Be specific:** "Build API" vs "Create 5 REST endpoints for user management"
3. **Realistic dates:** Leave buffer time (2-3 days buffer recommended)
4. **Detailed checklists:** Help engineers understand scope
5. **Clear attachments:** Link to actual documents, not just descriptions
6. **Consistent formatting:** Similar structure for all tasks aids parsing
7. **Test first:** Import a test PDF with 2-3 tasks before bulk import

---

## When Things Go Wrong

**PDF won't import:**
- Check if it's a real PDF, not image
- Try exporting from source again
- Simplify formatting (remove complex styling)
- Test with sample template from this guide

**Most tasks skipped:**
- Check titles are 3+ characters
- Verify date format is YYYY-MM-DD
- Ensure priority is Low/Medium/High
- Look for validation error messages

**Auto-distribute not working:**
- Verify employees have specializations set
- Check employees are marked as isActive
- Ensure tasks have no assignedTo value
- Review assignment reasons in modal

**Assignments seem random:**
- Add more employees with different specializations
- Ensure employee skills match task keywords
- Check score calculation in UI (open browser dev tools)
- Consider manual assignment if auto doesn't work well
