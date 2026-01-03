const OpenAI = require("openai");

let client = null;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function ensureOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!client && apiKey) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Sends text to OpenAI and expects STRICT JSON in response.
 * Throws an error with code 'OPENAI_NOT_CONFIGURED' if API key missing.
 * @param {string} systemPrompt
 * @param {string} userText
 */
async function getJsonFromText(systemPrompt, userText) {
  const openai = ensureOpenAI();
  if (!openai) {
    const err = new Error("OpenAI not configured");
    err.code = "OPENAI_NOT_CONFIGURED";
    throw err;
  }

  const messages = [
    {
      role: "system",
      content:
        (systemPrompt || "") +
        "\nYou MUST respond with STRICT JSON ONLY. No markdown, no prose.",
    },
    {
      role: "user",
      content: userText?.slice(0, 100_000) || "",
    },
  ];

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages,
  });

  const content = resp?.choices?.[0]?.message?.content || "{}";
  
  // Try to parse JSON
  try {
    // Remove markdown code blocks if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // If parsing fails, return as string (legacy behavior)
    return content;
  }
}

module.exports = { ensureOpenAI, getJsonFromText, MODEL };
