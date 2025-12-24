const { getJsonFromText, MODEL, ensureOpenAI } = require("./openaiClient");

/**
 * Evaluate a training task submission via OpenAI (STRICT JSON)
 * @param {Object} task - Task doc (title, description, requirements, rubricItems)
 * @param {Object} submission - { repoUrl, codeSnippet, notes }
 * @returns {Promise<Object>} aiEvaluation JSON
 */
async function evaluateTrainingTaskSubmission(task, submission) {
  const client = ensureOpenAI();
  if (!client) {
    const err = new Error("OpenAI not configured");
    err.code = "OPENAI_NOT_CONFIGURED";
    throw err;
  }

  const rubricItems = Array.isArray(task.rubricItems) ? task.rubricItems : [];
  const maxScore = rubricItems.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0) || (Number(task.maxPoints) || 0);
  const systemPrompt = `You are a fair and expert code reviewer for training tasks. Return STRICT JSON ONLY in the following shape:\n{
    "score": number,
    "maxScore": number,
    "percent": number,
    "pass": boolean,
    "breakdown": [
      { "criterion": string, "score": number, "maxPoints": number, "reasoning": string }
    ],
    "strengths": [string],
    "issues": [string],
    "suggestions": [string],
    "shortFeedback": string
  }\nCRITICAL RULES:\n- Give PARTIAL CREDIT generously: if a criterion is partially met, award proportional points (e.g., 50% complete = 50% of maxPoints).\n- The total "score" MUST equal the sum of all breakdown item "score" values.\n- Award points for effort, code structure, and meeting requirements even if not perfect.\n- Case-insensitive matching: "React" = "react" = "REACT".\n- If keywords are provided in rubric, award points if they appear (case-insensitive).\n- Do NOT hallucinate execution; grade based on repo URL text and provided snippet only.\n- If submission shows clear understanding and effort, award at least 60-70% of points.\n- Only give very low scores (0-30%) if submission is clearly insufficient or missing critical components.\n- Keep reasoning concise but specific.\n- Do not include anything outside of JSON.`;

  const requirementsText = (Array.isArray(task.requirements) ? task.requirements : []).map((r, i) => `- ${r}`).join("\n");
  const rubricText = rubricItems.map((r, i) => `${i+1}. ${r.criterion} (max ${r.maxPoints})${Array.isArray(r.keywords)&&r.keywords.length?` keywords: ${r.keywords.join(', ')}`:''}`).join("\n");
  const userText = `Task: ${task.title}\nDescription: ${task.description || ''}\nRequirements:\n${requirementsText}\nRubric:\n${rubricText}\n\nSubmission:\nRepoURL: ${submission.repoUrl || ''}\nNotes: ${(submission.notes || '').slice(0, 2000)}\nCodeSnippet:\n${(submission.codeSnippet || '').slice(0, 12000)}`;

  let raw = await getJsonFromText(systemPrompt, userText);
  let parsed;
  try {
    parsed = typeof raw === "object" ? raw : JSON.parse(raw);
  } catch (e) {
    // Fallback minimal JSON if parsing fails
    parsed = {
      score: 0,
      maxScore,
      percent: 0,
      pass: false,
      breakdown: rubricItems.map((r) => ({ criterion: r.criterion, score: 0, maxPoints: r.maxPoints, reasoning: "Invalid AI JSON response" })),
      strengths: [],
      issues: ["AI response could not be parsed"],
      suggestions: ["Retry submission with clearer code snippet and README"],
      shortFeedback: "Submission evaluated, but AI JSON was invalid.",
    };
  }

  // Validate and fix breakdown scores
  let breakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
  let breakdownSum = 0;
  
  // Ensure breakdown items match rubric items and calculate sum
  if (breakdown.length > 0 && rubricItems.length > 0) {
    // Match breakdown items to rubric items by criterion name (case-insensitive)
    const matchedBreakdown = rubricItems.map((rubricItem) => {
      const breakdownItem = breakdown.find(
        (b) => b.criterion && rubricItem.criterion &&
        b.criterion.toLowerCase().trim() === rubricItem.criterion.toLowerCase().trim()
      );
      
      if (breakdownItem) {
        const itemScore = Math.max(0, Math.min(rubricItem.maxPoints, Number(breakdownItem.score || 0)));
        breakdownSum += itemScore;
        return {
          criterion: rubricItem.criterion,
          score: itemScore,
          maxPoints: rubricItem.maxPoints,
          reasoning: breakdownItem.reasoning || "Evaluated",
        };
      } else {
        // If no match found, award 0 points
        return {
          criterion: rubricItem.criterion,
          score: 0,
          maxPoints: rubricItem.maxPoints,
          reasoning: "Criterion not evaluated",
        };
      }
    });
    breakdown = matchedBreakdown;
  } else if (breakdown.length === 0 && rubricItems.length > 0) {
    // If no breakdown provided but rubric exists, create default breakdown
    breakdown = rubricItems.map((r) => ({
      criterion: r.criterion,
      score: 0,
      maxPoints: r.maxPoints,
      reasoning: "No breakdown provided by AI",
    }));
  }

  // Use breakdown sum if it's valid, otherwise use parsed score
  let finalScore = breakdownSum > 0 ? breakdownSum : Math.max(0, Math.min(maxScore, Number(parsed.score || 0)));
  
  // Ensure score doesn't exceed maxScore
  finalScore = Math.max(0, Math.min(maxScore, finalScore));
  const percent = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;

  return {
    score: finalScore,
    maxScore,
    percent,
    pass: percent >= 60 || !!parsed.pass, // Pass if >= 60% or explicitly marked
    breakdown,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    shortFeedback: (parsed.shortFeedback || "").toString(),
    evaluatedAt: new Date(),
    model: MODEL,
  };
}

module.exports = { evaluateTrainingTaskSubmission };
