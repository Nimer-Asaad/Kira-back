# Backend Implementation Guide - CV Auto Distribution

## Three Files to Modify

### 1. controllers/taskController.js

Update the `distributeTasksAuto` function:

```javascript
// ADD AT TOP: Import the new function
const { 
  autoDistributeTasks,
  analyzeCVsAndRecommendTasks  // NEW
} = require("../services/taskDistributionService");

// REPLACE: The distributeTasksAuto function
const distributeTasksAuto = async (req, res) => {
  try {
    const { status, action, useCVMatching } = req.body;

    // NEW: Handle analyze mode
    if (action === "analyze") {
      const cvAnalysis = await analyzeCVsAndRecommendTasks(req.user._id, status);
      return res.json(cvAnalysis);
    }

    // EXISTING: Distribution mode
    const filter = status ? { status } : {};
    const result = await autoDistributeTasks(
      req.user._id, 
      filter, 
      useCVMatching  // NEW: pass CV flag
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

### 2. services/taskDistributionService.js

Add new function for CV analysis:

```javascript
const analyzeCVsAndRecommendTasks = async (adminId, statusFilter = "") => {
  try {
    const Trainee = require("../models/Trainee");
    const Task = require("../models/Task");

    // Get trainees with CV data
    const trainees = await Trainee.find()
      .populate({
        path: "applicantId",
        select: "extractedSkills"
      })
      .lean();

    if (!trainees || trainees.length === 0) {
      return { extractedSkills: [], recommendedTasks: [], message: "No trainees found" };
    }

    // Aggregate skills
    const skillsMap = new Map();
    trainees.forEach(trainee => {
      (trainee.applicantId?.extractedSkills || []).forEach(skill => {
        const key = (skill.name || "").toLowerCase();
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
    });

    // Get top 5 skills
    const extractedSkills = Array.from(skillsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(s => ({
        name: s.name,
        proficiency: s.proficiency
      }));

    // Get unassigned tasks
    const taskFilter = {
      assignedTo: null,
      ownerType: { $in: ["trainee", "employee"] }
    };
    if (statusFilter) taskFilter.status = statusFilter;

    const unassignedTasks = await Task.find(taskFilter)
      .select("_id title description difficulty")
      .limit(50)
      .lean();

    // Score tasks by skill match
    const recommendedTasks = unassignedTasks
      .map(task => {
        const taskText = `${task.title} ${task.description || ""}`.toLowerCase();
        const matchedSkills = extractedSkills.filter(s => 
          taskText.includes(s.name.toLowerCase())
        );
        return {
          taskId: task._id.toString(),
          title: task.title,
          difficulty: task.difficulty || "medium",
          reason: matchedSkills.length > 0 
            ? `Matches skills: ${matchedSkills.map(s => s.name).join(", ")}`
            : "Recommended for training"
        };
      })
      .filter(t => t.reason !== "Recommended for training" || extractedSkills.length === 0)
      .sort((a, b) => b.reason.length - a.reason.length)
      .slice(0, 3);

    return { extractedSkills, recommendedTasks, traineesAnalyzed: trainees.length };

  } catch (error) {
    console.error("CV analysis error:", error);
    return { extractedSkills: [], recommendedTasks: [], error: error.message };
  }
};

// UPDATE: autoDistributeTasks signature
const autoDistributeTasks = async (adminId, filter, useCVMatching = false) => {
  // In scoring calculation, add CV bonus:
  if (useCVMatching && employee.applicantId?.extractedSkills) {
    employee.applicantId.extractedSkills.forEach(skill => {
      const taskText = `${task.title} ${task.description || ""}`.toLowerCase();
      if (taskText.includes(skill.name.toLowerCase())) {
        score += 25; // CV skill bonus
      }
    });
  }
  // ... rest of function unchanged
};

// UPDATE: Exports
module.exports = {
  // ... existing ...
  autoDistributeTasks,
  analyzeCVsAndRecommendTasks
};
```

### 3. That's it!

No other files need changes. The frontend handles the rest.

---

## API Contracts

### CV Analysis
```
POST /api/tasks/auto-distribute
{ "action": "analyze", "status": "pending" }

Response:
{
  "extractedSkills": [
    { "name": "React", "proficiency": "expert" }
  ],
  "recommendedTasks": [
    {
      "taskId": "...",
      "title": "Build React Dashboard",
      "difficulty": "medium",
      "reason": "Matches skills: React, JavaScript"
    }
  ]
}
```

### Distribution with CV
```
POST /api/tasks/auto-distribute
{ "status": "pending", "useCVMatching": true }

Response: (same as before, but with better scoring)
```

