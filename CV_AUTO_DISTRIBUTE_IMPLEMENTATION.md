# CV-Based Auto Distribution Enhancement

## Overview

The AutoDistributeModal has been enhanced to:
1. Analyze trainee/employee CVs when modal opens
2. Extract top skills and proficiency levels
3. Recommend tasks based on CV skills match
4. Display CV-based insights before task distribution
5. Use CV matching during actual distribution if available

## Frontend Changes (Completed)

### AutoDistributeModal.jsx Enhancements

**New State Variables:**
- `cvData`: Stores extracted skills and recommended tasks
- `loadingCV`: Loading state while analyzing CVs
- `cvError`: Error message if CV analysis fails

**New Functions:**
- `fetchCVAnalysis()`: Calls `/api/tasks/auto-distribute` with `action: "analyze"` to get CV insights without distributing
- `handleSubmit()`: Updated to pass `useCVMatching: true` when CV data is available

**New UI Sections:**
- Loading spinner while analyzing CVs
- "About CV" section showing:
  - Top 5 extracted skills with proficiency badges
  - Top 3 recommended tasks with difficulty badges and match reasons
  - Error message with CTA to upload CV if no data available
- Yellow warning if CVs unavailable
- Purple box with analysis results if CVs available

## Backend Implementation Required

### 1. Modify TaskController.distributeTasksAuto()

**File:** `Kira-Backend/controllers/taskController.js`

**Changes:**
```javascript
const distributeTasksAuto = async (req, res) => {
  try {
    const { status, action, useCVMatching } = req.body;

    // If action is "analyze", return CV analysis without distributing
    if (action === "analyze") {
      const cvAnalysis = await analyzeCVsAndRecommendTasks(req.user._id, status);
      return res.json(cvAnalysis);
    }

    // Regular distribution (with CV matching if available)
    const filter = status ? { status } : {};
    const result = await autoDistributeTasks(
      req.user._id, 
      filter, 
      useCVMatching
    );

    res.json({
      message: "Auto-distribution completed",
      ...result,
    });
  } catch (error) {
    console.error("Auto-distribution error:", error);
    res.status(500).json({
      message: "Auto-distribution failed",
      error: error.message,
    });
  }
};
```

### 2. Create New Service Function: analyzeCVsAndRecommendTasks()

**File:** `Kira-Backend/services/taskDistributionService.js`

**Implementation:**
```javascript
/**
 * Analyze trainee CVs and recommend matching tasks
 * @param {ObjectId} adminId - Admin performing the analysis
 * @param {string} statusFilter - Task status filter (pending, in-progress, or empty)
 * @returns {Promise} { extractedSkills: Array, recommendedTasks: Array }
 */
const analyzeCVsAndRecommendTasks = async (adminId, statusFilter) => {
  try {
    const Trainee = require("../models/Trainee");
    const Applicant = require("../models/Applicant");
    const Task = require("../models/Task");

    // 1. Get all trainees with their CVs (via applicantId)
    const trainees = await Trainee.find()
      .populate({
        path: "applicantId",
        select: "extractedSkills"
      })
      .lean();

    if (!trainees.length) {
      return {
        extractedSkills: [],
        recommendedTasks: [],
        message: "No trainees found"
      };
    }

    // 2. Aggregate extracted skills across all trainees
    const skillsMap = new Map();
    trainees.forEach(trainee => {
      if (trainee.applicantId?.extractedSkills) {
        trainee.applicantId.extractedSkills.forEach(skill => {
          const key = skill.name?.toLowerCase();
          if (key) {
            if (!skillsMap.has(key)) {
              skillsMap.set(key, {
                name: skill.name,
                proficiency: skill.proficiency || "intermediate",
                count: 1
              });
            } else {
              skillsMap.get(key).count += 1;
            }
          }
        });
      }
    });

    // 3. Sort and get top 5 skills
    const extractedSkills = Array.from(skillsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(skill => ({
        name: skill.name,
        proficiency: skill.proficiency
      }));

    // 4. Get recommended tasks (unassigned, matching top skills)
    const filter = {
      assignedTo: null,
      ownerType: { $in: ["trainee", "employee"] }
    };

    if (statusFilter) {
      filter.status = statusFilter;
    }

    const unassignedTasks = await Task.find(filter)
      .select("_id title description priority difficulty status")
      .limit(20)
      .lean();

    // 5. Score tasks based on skill match
    const recommendedTasks = unassignedTasks
      .map(task => {
        const taskText = `${task.title} ${task.description}`.toLowerCase();
        let matchScore = 0;
        let matchedSkills = [];

        extractedSkills.forEach(skill => {
          if (taskText.includes(skill.name.toLowerCase())) {
            matchScore += 2;
            matchedSkills.push(skill.name);
          }
        });

        return {
          taskId: task._id,
          title: task.title,
          difficulty: task.difficulty || "medium",
          reason: matchedSkills.length 
            ? `Matches skills: ${matchedSkills.join(", ")}`
            : "Recommended for training"
        };
      })
      .filter(task => task.reason !== "Recommended for training" || extractedSkills.length === 0)
      .sort((a, b) => b.reason.length - a.reason.length)
      .slice(0, 3);

    return {
      extractedSkills,
      recommendedTasks,
      traineesAnalyzed: trainees.length,
      unassignedTasksCount: unassignedTasks.length
    };
  } catch (error) {
    console.error("CV analysis error:", error);
    throw error;
  }
};

module.exports = {
  // ... existing exports ...
  analyzeCVsAndRecommendTasks,
  autoDistributeTasks: (adminId, filter, useCVMatching) => {
    // Modify to accept useCVMatching parameter
    // Implement CV-based weighting in task scoring if useCVMatching=true
  }
};
```

### 3. Update autoDistributeTasks() to Support CV Matching

**File:** `Kira-Backend/services/taskDistributionService.js`

**Key Changes:**
- Accept `useCVMatching` parameter
- When true, boost scoring for tasks matching trainee CV skills
- Prioritize tasks that match extracted skills during assignment

**Scoring Enhancement:**
```javascript
// In task scoring logic, add CV skill matching bonus
if (useCVMatching && trainee.applicantId?.extractedSkills) {
  trainee.applicantId.extractedSkills.forEach(skill => {
    const taskText = `${task.title} ${task.description}`.toLowerCase();
    if (taskText.includes(skill.name.toLowerCase())) {
      score += 25; // CV skill match bonus
    }
  });
}
```

### 4. Export Updated Function

**File:** `Kira-Backend/controllers/taskController.js`

**Update exports:**
```javascript
module.exports = {
  // ... existing exports ...
  analyzeTasksForCVMatching: analyzeCVsAndRecommendTasks,
};
```

## API Contract

### Request: Analyze CVs (action="analyze")
```json
POST /api/tasks/auto-distribute
{
  "action": "analyze",
  "status": "pending" // optional: filter by status
}
```

### Response: CV Analysis
```json
{
  "extractedSkills": [
    {
      "name": "React",
      "proficiency": "expert"
    },
    {
      "name": "Node.js",
      "proficiency": "intermediate"
    }
  ],
  "recommendedTasks": [
    {
      "taskId": "507f1f77bcf86cd799439011",
      "title": "Build React Dashboard",
      "difficulty": "medium",
      "reason": "Matches skills: React, JavaScript"
    }
  ],
  "traineesAnalyzed": 5,
  "unassignedTasksCount": 12
}
```

### Request: Distribute with CV Matching
```json
POST /api/tasks/auto-distribute
{
  "status": "pending",
  "useCVMatching": true
}
```

### Response: Distribution Results
```json
{
  "message": "Auto-distribution completed",
  "assignedCount": 8,
  "unassignedCount": 4,
  "totalTasks": 12,
  "assignments": [
    {
      "taskId": "507f1f77bcf86cd799439011",
      "taskTitle": "Build React Dashboard",
      "employeeName": "John Doe",
      "reason": "Matched Frontend; matched skills: React, CSS; workload: 2 active tasks; capacity: Yes"
    }
  ]
}
```

## Implementation Steps

1. **Update TaskController.distributeTasksAuto()** to handle `action` parameter
2. **Create analyzeCVsAndRecommendTasks()** service function
3. **Enhance autoDistributeTasks()** to accept and use `useCVMatching` parameter
4. **Update Trainee model** to ensure `applicantId` is populated with `extractedSkills`
5. **Test CV analysis** with trainees that have CV data
6. **Test distribution** with CV matching enabled
7. **Error handling** for trainees without CV data

## Data Requirements

**Trainee Model:**
- Must have `applicantId` reference to Applicant model
- Applicant must have `extractedSkills` array populated

**Applicant Model (required):**
```javascript
extractedSkills: [{
  name: String,
  proficiency: String // 'beginner', 'intermediate', 'expert'
}]
```

**Task Model (required):**
- `difficulty`: String (easy, medium, hard)
- `assignedTo`: ObjectId or null
- `ownerType`: String (trainee, employee, admin)
- `status`: String (pending, in-progress, completed)

## Error Handling

**No CVs Found:**
- Frontend shows: "No CV data available. Please ensure trainees have uploaded their CVs in their profiles."
- Fallback to standard distribution (non-CV based)
- User can still proceed with regular auto-distribute

**Missing applicantId:**
- Skip trainee in CV analysis
- Continue with other trainees

**API Analysis Fails:**
- Return empty `extractedSkills` and `recommendedTasks`
- Frontend shows warning
- Allow user to proceed with standard distribution

## Testing Checklist

- [ ] CV analysis works when trainees have CVs
- [ ] Shows empty state when no CVs available
- [ ] Recommended tasks display correctly with reasons
- [ ] Skills chips show proficiency levels
- [ ] Distribution with CV matching prioritizes skill matches
- [ ] Distribution without CV matching uses standard algorithm
- [ ] Error messages are user-friendly
- [ ] Loading spinner appears during CV analysis
- [ ] Can close modal without distributing after analyzing

## Frontend Integration Status

✅ AutoDistributeModal.jsx enhanced with:
- CV data state management
- useEffect hook for auto-analysis on modal open
- fetchCVAnalysis() function
- Updated handleSubmit() with useCVMatching flag
- UI for loading, error, and success states
- Skills chips display
- Recommended tasks preview

⏳ Backend Implementation Pending:
- analyzeCVsAndRecommendTasks() service function
- Updated distributeTasksAuto() controller
- Enhanced autoDistributeTasks() with CV matching logic
- Error handling and validation

