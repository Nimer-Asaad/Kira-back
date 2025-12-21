const Task = require("../models/Task");
const User = require("../models/User");

/**
 * Service for auto-distribution of tasks to employees
 */

/**
 * Get active task count for an employee
 */
const getActiveTaskCount = async (employeeId) => {
  try {
    const count = await Task.countDocuments({
      assignedTo: employeeId,
      status: { $in: ["pending", "in-progress"] },
    });
    return count;
  } catch (error) {
    console.error("Error getting active task count:", error);
    return 0;
  }
};

/**
 * Map keywords to specialization
 * Returns: { specialization: string, matchedKeywords: string[] }
 */
const determineRequiredSpecialization = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();

  const keywordMap = {
    Frontend: [
      "react",
      "vue",
      "angular",
      "javascript",
      "tsx",
      "jsx",
      "css",
      "html",
      "ui",
      "frontend",
      "client",
    ],
    Backend: [
      "node",
      "express",
      "api",
      "database",
      "db",
      "server",
      "backend",
      "rest",
      "graphql",
      "mongodb",
      "mysql",
      "postgres",
    ],
    AI: [
      "ai",
      "ml",
      "machine learning",
      "deep learning",
      "llm",
      "gpt",
      "neural",
      "model",
      "prediction",
    ],
    QA: ["test", "qa", "quality", "automation", "selenium", "jest", "unit"],
    DevOps: [
      "docker",
      "kubernetes",
      "ci/cd",
      "deploy",
      "devops",
      "infrastructure",
      "aws",
      "git",
    ],
    "UI/UX": ["design", "ui", "ux", "figma", "mockup", "wireframe", "prototype"],
  };

  const results = {};
  for (const [spec, keywords] of Object.entries(keywordMap)) {
    const matched = keywords.filter((kw) => text.includes(kw));
    results[spec] = matched.length;
  }

  const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
  const topSpec = sorted[0];

  return {
    specialization: topSpec[0],
    matchStrength: topSpec[1],
    matchedKeywords: keywordMap[topSpec[0]].filter((kw) => text.includes(kw)),
  };
};

/**
 * Calculate skill match between task and employee
 * Returns: { matchedSkills: {name, level}[], totalSkillPoints: number }
 */
const getSkillMatches = (employee, requiredSpecialization, title, description) => {
  if (!employee.skills || employee.skills.length === 0) {
    return { matchedSkills: [], totalSkillPoints: 0 };
  }

  const text = `${title} ${description}`.toLowerCase();
  const matchedSkills = [];
  let totalSkillPoints = 0;

  for (const skill of employee.skills) {
    const skillName = skill.name.toLowerCase();
    // Simple keyword matching
    if (text.includes(skillName) || skillName.includes(text.substring(0, 4))) {
      matchedSkills.push({
        name: skill.name,
        level: skill.level,
      });
      totalSkillPoints += skill.level * 10;
    }
  }

  return { matchedSkills, totalSkillPoints };
};

/**
 * Calculate assignment score for an employee
 */
const calculateAssignmentScore = async (employee, task, requiredSpec) => {
  let score = 0;

  // Specialization match: 50 points
  if (employee.specialization === requiredSpec.specialization) {
    score += 50;
  } else if (employee.specialization === "General") {
    score += 20; // General can handle any task but lower priority
  }

  // Skill matches: up to 10 points per matched skill level
  const skillMatch = getSkillMatches(
    employee,
    requiredSpec.specialization,
    task.title,
    task.description
  );
  score += skillMatch.totalSkillPoints;

  // Workload penalty: -12 per active task
  const activeCount = await getActiveTaskCount(employee._id);
  score -= activeCount * 12;

  // Heavy overload penalty
  if (activeCount >= employee.maxConcurrentTasks) {
    score -= 100;
  }

  return {
    score,
    activeCount,
    skillMatches: skillMatch.matchedSkills,
  };
};

/**
 * Auto-distribute tasks to employees
 */
const autoDistributeTasks = async (userId, taskFilter = {}) => {
  try {
    // Get all active employees
    const employees = await User.find({
      isActive: true,
      role: { $in: ["user", "hr"] },
    }).lean();

    if (employees.length === 0) {
      return {
        assignedCount: 0,
        unassignedCount: 0,
        assignments: [],
        message: "No active employees found",
      };
    }

    // Build filter: unassigned tasks created by this user
    const filter = {
      createdBy: userId,
      assignedTo: null,
      ...taskFilter,
    };

    // If filtering by status, add it
    if (taskFilter.status) {
      filter.status = taskFilter.status;
    } else {
      // Default: only distribute pending tasks
      filter.status = "pending";
    }

    const unassignedTasks = await Task.find(filter);

    const assignments = [];
    let assignedCount = 0;

    for (const task of unassignedTasks) {
      // Determine required specialization
      const requiredSpec = determineRequiredSpecialization(task.title, task.description);

      // Score all employees
      const scores = [];
      for (const employee of employees) {
        const scoreData = await calculateAssignmentScore(employee, task, requiredSpec);
        scores.push({
          employee,
          ...scoreData,
        });
      }

      // Sort by score (highest first), then by active count (lowest first)
      scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.activeCount - b.activeCount;
      });

      // Pick the best employee
      if (scores.length > 0 && scores[0].score > -100) {
        // Only assign if score is reasonable
        const selectedEmployee = scores[0];

        // Build assignment reason
        const specMatch = selectedEmployee.employee.specialization === requiredSpec.specialization
          ? `specialization ${requiredSpec.specialization}`
          : `role ${selectedEmployee.employee.specialization}`;

        const skillText = selectedEmployee.skillMatches.length
          ? `matched skills: ${selectedEmployee.skillMatches.map((s) => `${s.name}(${s.level})`).join(", ")}`
          : "no specific skill matches";

        const reason =
          `Matched ${specMatch}; ${skillText}; workload: ${selectedEmployee.activeCount} active tasks`;

        // Update task
        await Task.findByIdAndUpdate(
          task._id,
          {
            assignedTo: selectedEmployee.employee._id,
            assignmentReason: reason,
          },
          { new: true }
        );

        assignments.push({
          taskId: task._id,
          taskTitle: task.title,
          employeeId: selectedEmployee.employee._id,
          employeeName: selectedEmployee.employee.fullName,
          reason,
        });

        assignedCount++;
      }
    }

    return {
      assignedCount,
      unassignedCount: unassignedTasks.length - assignedCount,
      totalTasks: unassignedTasks.length,
      assignments,
    };
  } catch (error) {
    throw new Error(`Auto-distribution failed: ${error.message}`);
  }
};

module.exports = {
  autoDistributeTasks,
  determineRequiredSpecialization,
  calculateAssignmentScore,
  getActiveTaskCount,
  getSkillMatches,
};
