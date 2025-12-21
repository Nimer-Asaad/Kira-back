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
  const systemPrompt = `You are an expert code reviewer for training tasks. Return STRICT JSON ONLY in the following shape:\n{
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
  }\nRules:\n- Do NOT hallucinate execution; grade based on repo URL text and provided snippet only.\n- If submission is insufficient, assign low score and explain what is missing.\n- Keep reasoning concise.\n- Do not include anything outside of JSON.`;

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

  const score = Math.max(0, Math.min(maxScore, Number(parsed.score || 0)));
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return {
    score,
    maxScore,
    percent,
    pass: !!parsed.pass,
    breakdown: Array.isArray(parsed.breakdown) ? parsed.breakdown : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    shortFeedback: (parsed.shortFeedback || "").toString(),
    evaluatedAt: new Date(),
    model: MODEL,
  };
}

module.exports = { evaluateTrainingTaskSubmission };
