Part 6.3: Trainee Lifecycle Management - Implementation Complete

## Overview

This implementation adds comprehensive trainee lifecycle controls to the Kira HR system, enabling HR to manage trainee training states (pause, freeze, resume, cancel) and allowing trainees to request withdrawal.

## Key Features

### 1. **Trainee Status States** (Added to Trainee model)
- `trial` - Active training
- `paused` - Temporarily paused (HR action)
- `frozen` - On hold for admin review (HR action)
- `cancelled` - Training stopped (final, HR action)
- `withdraw_requested` - Trainee requested withdrawal (pending HR approval)
- `withdrawn` - Withdrawal approved (final, HR action)
- `needs_improvement`, `part_time_candidate`, `eligible_for_promotion`, `promoted` - existing statuses

### 2. **HR Actions** (Dashboard: /hr/trainees)

Lifecycle buttons appear on trainee cards and are context-sensitive:

#### When trainee is in "trial" status:
- **⏸ Pause** - Temporarily pause training with optional reason and date
- **❄️ Freeze** - Freeze training for admin hold with reason
- **✘ Cancel** - Cancel training permanently (final action)
- Standard actions: AI Generate, Link Account, Distribute PDF, Evaluate, Promote

#### When trainee is "paused" or "frozen":
- **▶️ Resume** - Return trainee to "trial" status

#### When trainee has "withdraw_requested":
- **✓ Approve** - Approve withdrawal (status → "withdrawn")
- **↩️ Reject** - Reject withdrawal (status → "trial")

### 3. **Trainee Actions** (Portal: /trainee/dashboard, /trainee/tasks)

#### Withdrawal Request
- Trainees can submit a withdrawal request via `POST /api/trainee/me/withdraw-request`
- Requires a reason (minimum 5 characters)
- Sets status to "withdraw_requested" and waits for HR approval/rejection

#### Status Banners
Displayed on trainee portal pages when status is not "trial":
- **Paused**: "⏸ Training is paused temporarily"
- **Frozen**: "❄️ Your training is on hold (HR review)"
- **Cancelled**: "✘ Training has been stopped by HR"
- **Withdraw Requested**: "↩️ Withdrawal request pending HR approval"
- **Withdrawn**: "You have withdrawn from training"

#### Task Submission
- Submit button is **disabled** when trainee status ≠ "trial"
- Error message provided via API: "Training is paused/frozen/cancelled/withdrawn. Cannot submit tasks."

### 4. **Database Changes** (Trainee Model)

New fields added:

**Pause State**
- `pausedAt: Date` - When paused
- `pauseUntil: Date` - Optional resume date
- `pausedReason: String` - Why paused
- `pausedBy: ObjectId` - HR user who paused

**Freeze State**
- `frozenAt: Date` - When frozen
- `freezeUntil: Date` - Optional unfreeze date
- `frozenReason: String` - Why frozen
- `frozenBy: ObjectId` - HR user who froze

**Cancel State**
- `cancelledAt: Date` - When cancelled
- `cancelReason: String` - Why cancelled
- `cancelledBy: ObjectId` - HR user who cancelled

**Withdraw State**
- `withdrawRequestedAt: Date` - When withdrawal requested
- `withdrawReason: String` - Trainee reason for withdrawal
- `withdrawnAt: Date` - When approved
- `withdrawnBy: ObjectId` - HR user who approved

**General**
- `statusUpdatedAt: Date` - Last status change timestamp

### 5. **API Endpoints**

**HR Routes** (Protected: JWT + hrOrAdmin role)
```
PATCH /api/hr/trainees/:id/pause
  Body: { reason: string, pauseUntil?: date }
  
PATCH /api/hr/trainees/:id/freeze
  Body: { reason: string, freezeUntil?: date }
  
PATCH /api/hr/trainees/:id/resume
  Returns trainee to "trial" status
  
PATCH /api/hr/trainees/:id/cancel
  Body: { reason: string }
  
PATCH /api/hr/trainees/:id/withdraw/approve
  Approves withdrawal (status → "withdrawn")
  
PATCH /api/hr/trainees/:id/withdraw/reject
  Rejects withdrawal (status → "trial")
```

**Trainee Routes** (Protected: JWT + trainee role)
```
POST /api/trainee/me/withdraw-request
  Body: { reason: string }
  Validates: reason.length >= 5
```

### 6. **Frontend Components**

**HR Trainees Page** (`/hr/trainees`)
- Trainee cards show status badge with color coding:
  - Blue: trial
  - Yellow: paused
  - Orange: frozen
  - Red: cancelled
  - Purple: withdraw_requested
  - Gray: withdrawn
  - Green: eligible_for_promotion/promoted
- Inline buttons for lifecycle actions
- Display pause/freeze/cancel reasons on cards

**Trainee Dashboard** (`/trainee/dashboard`)
- Status banners at top for non-trial states
- Prevents viewing HR score when training interrupted

**Trainee Tasks** (`/trainee/tasks`)
- Status banners at top
- Submit/Start buttons disabled when status ≠ "trial"
- Clear messaging about why actions are blocked

### 7. **Timing Behavior During Paused/Frozen**

Currently implemented via **blocking submissions**:
- When trainee submits a task during paused/frozen/cancelled/withdrawn status, the backend returns a 403 error
- Late/early time penalties are not computed for blocked submissions
- Time effectively "pauses" because task timing continues on the due date, but submission is blocked, preventing points accumulation

Future enhancement option:
- Store "blocked intervals" in trainee model
- Calculate time bonuses/penalties excluding paused/frozen periods

### 8. **Security**

- Only HR/Admin can change trainee lifecycle states (pause/freeze/resume/cancel/approve/reject withdrawal)
- Trainees can only request withdrawal for themselves
- Task submit endpoint verifies trainee status before allowing submission
- Routes protected with JWT + role middleware

### 9. **Status Transition Rules**

```
trial → paused → trial (resume)
trial → frozen → trial (resume)
trial → cancelled (final - optional resume)
trial → withdraw_requested → withdrawn (approve) or trial (reject)
paused/frozen → cancelled (if needed)
```

**Final States** (prevent further submissions unless HR resumes):
- cancelled
- withdrawn

### 10. **Files Modified**

**Backend**
- `models/Trainee.js` - Added status enum values and lifecycle fields
- `controllers/traineeLifecycleController.js` - **NEW** - All lifecycle action handlers
- `controllers/traineeTaskController.js` - Added status check to block submissions
- `routes/traineePortalRoutes.js` - Added withdraw-request endpoint
- `routes/traineeLifecycleRoutes.js` - **NEW** - All HR lifecycle routes
- `server.js` - Registered new routes

**Frontend**
- `utils/apiPaths.js` - Added lifecycle API paths
- `pages/HR/Trainees.jsx` - Added lifecycle action functions and UI buttons
- `pages/Trainee/Dashboard.jsx` - Added status banners
- `pages/Trainee/TraineeTasks.jsx` - Added status banners and submission blocking

### 11. **Testing the Features**

1. **HR Pause a Trainee**
   - Go to /hr/trainees
   - Click ⏸ Pause on any trial trainee
   - Enter a pause reason
   - Verify status changes to "paused" and reason displays

2. **Trainee Cannot Submit While Paused**
   - Log in as trainee with paused training
   - Go to /trainee/tasks
   - Verify banner says "Training is paused temporarily"
   - Try to click Submit button (should be disabled)

3. **HR Resume Training**
   - Click ▶️ Resume on a paused trainee
   - Verify status returns to "trial"

4. **Trainee Request Withdrawal**
   - Need to add UI button on trainee portal (or use API directly)
   - POST to /api/trainee/me/withdraw-request with reason
   - Status becomes "withdraw_requested"

5. **HR Approve/Reject Withdrawal**
   - Trainee with "withdraw_requested" appears with special buttons
   - Click ✓ Approve or ↩️ Reject
   - Status becomes "withdrawn" or returns to "trial"

### 12. **Known Limitations**

- Time bonus/penalty calculations don't explicitly exclude paused/frozen intervals yet
  - Current approach: Block submissions during non-trial states
  - Could be enhanced to track blocked intervals if needed
- No automatic resume on `pauseUntil` date (would need scheduled job)
- Cancellation is currently not reversible (can be added if needed)

### 13. **Future Enhancements**

- [ ] Scheduled job to auto-resume at pauseUntil/freezeUntil dates
- [ ] Trainee portal UI for withdrawal request (currently API only)
- [ ] Email notifications for pause/freeze/cancel/withdrawal events
- [ ] Trainee comment system for appeal/discussion
- [ ] Archive old training records
- [ ] Detailed audit log of all status transitions
