let checklistDebugLogged = false;

const pdfParse = require("pdf-parse");
const OpenAI = require("openai");

// Initialize OpenAI if API key exists
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Extract text from PDF buffer
 */
const extractTextFromPdf = async (pdfBuffer) => {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
};

// ---------- Helpers for robust parsing ----------
const normalizeText = (text) =>
  (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeTitle = (title) =>
  (title || "").toLowerCase().replace(/\s+/g, " ").trim();

const splitIntoTaskBlocks = (text) => {
  const normalized = normalizeText(text);
  const parts = normalized.split(/(?=^\s*Task\s*#?\s*\d+\s*[:\-]?)/gim);
  return parts
    .map((p) => p.trim())
    .filter((p) => /^task\s*#?\s*\d+/i.test(p));
};

const extractTitle = (block) => {
  // Handle explicit "Task Title:" or "Title:" label (supports wrapped line)
  const mTitle = block.match(
    /(?:Task\s+)?Title\s*[:\-]?\s*([^\n]+)|(?:Task\s+)?Title\s*[:\-]?\s*\n\s*([^\n]+)/i
  );
  if (mTitle) {
    const titleVal = (mTitle[1] || mTitle[2] || "").trim();
    if (titleVal) return titleVal;
  }

  // Handle: "Task #1: My Title" or "Task 1: My Title" format
  const m1 = block.match(
    /Task\s*#?\s*\d+\s*[:\-]?\s*([^\n]*?)(?=\n|Priority|Due\s*Date|Description|TODO|Checklist|Attachments|Assign|Title|$)/i
  );
  if (m1 && m1[1] && m1[1].trim()) return m1[1].trim();

  // Fallback: first meaningful non-empty line after Task header (skip field labels)
  const lines = block.split("\n").map((l) => l.trim());
  if (lines.length > 1) {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (
        line &&
        !/^(Priority|Due\s*Date|Description|TODO|Checklist|Attachments|Assign|Title)\b/i.test(
          line
        )
      ) {
        return line.replace(/[:\-]+$/, "").trim();
      }
    }
  }
  return ""; // will be auto-filled later
};

const extractPriority = (block) => {
  const m = block.match(/Priority\s*[:\-]?\s*([A-Za-z0-9]+)/i);
  if (!m) return "Medium";
  const p = (m[1] || "").toLowerCase();
  if (p.includes("low") || p === "1") return "Low";
  if (p.includes("high") || p === "3") return "High";
  return "Medium";
};

const extractDueDate = (block) => {
  // Supports YYYY-MM-DD or MM/DD/YYYY
  const mIso = block.match(
    /Due\s*Date\s*[:\-]?\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/i
  );
  if (mIso) return mIso[1].replace(/\//g, "-");

  const mUs = block.match(
    /Due\s*Date\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (mUs) {
    const [mm, dd, yyyy] = mUs[1].split("/");
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
};

const extractDescription = (block) => {
  const m = block.match(
    /Description\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(TODO\s*Checklist|Checklist|Attachments|Priority|Due\s*Date|Assign\s*To|Task\s*#?\s*\d+)\b|$)/i
  );
  return m ? m[1].trim() : "";
};

const extractChecklist = (block) => {
  const normalizedBlock = normalizeText(block);

  /**
   * CRITICAL FIX:
   * Anchor header to start-of-line so it DOES NOT match "Checklist" inside the title text
   * Example bad case: "Fix Checklist Rendering..." was being treated as checklist header.
   */
  const headerRegex = /(^|\n)\s*(TODO\s+Checklist|Checklist)\s*[:\-]\s*/im;
  const headerMatch = normalizedBlock.match(headerRegex);
  if (!headerMatch) return [];

  // Start parsing after the matched header line
  const startIdx = headerMatch.index + headerMatch[0].length;
  const afterHeader = normalizedBlock.slice(startIdx);

  // Stop at known section headers or the next task header (also anchored to start-of-line)
  const stopRegex = /(^|\n)\s*(Attachments|Assign\s*To|Priority|Due\s*Date|Task\s*#?\s*\d+)\b/im;
  const stopMatch = afterHeader.match(stopRegex);
  const checklistSection = stopMatch
    ? afterHeader.slice(0, stopMatch.index)
    : afterHeader;

  const lines = checklistSection
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  // Accept a wide range of bullet characters
  const bulletChars =
    "-\u2022\u00b7o\uf0a7\uf0a8\u25cf\u25cb\u25aa\u2013\u2014\u2023\u25c9\u25a0\u25b8\u25e6\u25d8";
  const bulletRegex = new RegExp(`^[${bulletChars}]+\\s*(.+)$`);

  // Ignore accidental label lines
  const labelRegex =
    /^(Task\s*Title|Title|Description|Priority|Due\s*Date|Assign\s*To|Attachments?)\s*[:\-]/i;

  const items = [];
  const fallbackLines = [];

  for (const line of lines) {
    if (labelRegex.test(line)) continue;

    const m = line.match(bulletRegex);
    if (m && m[1]?.trim()) {
      items.push(m[1].trim());
    } else {
      // fallback candidate
      fallbackLines.push(line);
    }
  }

  // If bullets exist, return bullet-only list (best)
  const finalList =
    items.length > 0
      ? items
      : fallbackLines.filter((l) => {
          if (!l || l.length < 6) return false;
          if (labelRegex.test(l)) return false;
          if (/:\s*$/.test(l)) return false; // ignore trailing colon lines
          return true;
        });

  // de-dup while preserving order
  const seen = new Set();
  const deduped = [];
  for (const it of finalList) {
    const key = it.toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it.trim());
  }

  if (!checklistDebugLogged) {
    console.log("[PDF Import][debug] checklistSection lines:", lines);
    console.log("[PDF Import][debug] extracted checklist items:", deduped);
    checklistDebugLogged = true;
  }

  return deduped;
};

const extractAttachments = (block) => {
  const m = block.match(/Attachments\s*[:\-]?\s*([\s\S]*)/i);
  if (!m) return [];

  const lines = m[1]
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const pair = line.match(/([\w\s]+)[:\-–—]\s*(https?:\/\/[^\s]+)/i);
    const urlOnly = line.match(/(https?:\/\/[^\s]+)/i);

    if (pair) out.push({ name: pair[1].trim(), url: pair[2].trim() });
    else if (urlOnly) out.push({ name: "Attachment", url: urlOnly[1].trim() });
  }
  return out;
};

const extractAssignTo = (block) => {
  const m = block.match(/Assign\s*To\s*[:\-]?\s*([^\n]+)/i);
  if (!m) return null;
  const v = (m[1] || "").trim();
  return v || null;
};

/**
 * LLM-based extraction using OpenAI
 */
const extractTasksWithLLM = async (pdfText) => {
  if (!openaiClient) throw new Error("OpenAI API key not configured");

  const prompt = `Extract tasks from the following PDF text. Return ONLY a valid JSON array with NO additional text or markdown code blocks. Each task object must have these fields:
- title: string (3-100 chars)
- description: string
- priority: "Low" | "Medium" | "High"
- dueDate: string in YYYY-MM-DD format or null
- checklist: array of strings (can be empty)
- attachments: array of {name: string, url: string} (can be empty, only include valid URLs starting with http)

PDF TEXT:
${pdfText}

Return ONLY the JSON array, nothing else:`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a JSON extraction expert. Extract structured task data and return ONLY valid JSON, no markdown, no explanation.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content.trim();

    // Remove markdown fences if present
    let cleaned = content
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    const tasks = JSON.parse(cleaned);
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    throw new Error(`LLM extraction failed: ${error.message}`);
  }
};

// Parse a single task block (string containing one task) using helpers
const parseTaskBlock = (block) => ({
  title: extractTitle(block),
  description: extractDescription(block),
  priority: extractPriority(block),
  dueDate: extractDueDate(block),
  checklist: extractChecklist(block),
  attachments: extractAttachments(block),
  assignTo: extractAssignTo(block),
});

const extractTasksWithRules = (pdfText) => {
  // First try block-based parsing
  const blocks = splitIntoTaskBlocks(pdfText);

  const tasks = [];
  for (const block of blocks) {
    tasks.push(parseTaskBlock(block));
  }

  if (tasks.length > 0) return tasks;

  // Fallback legacy line-based parsing
  const lineTasks = [];
  const lines = normalizeText(pdfText).split("\n");
  let currentTask = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^task\s*#?\d+/i.test(line)) {
      if (currentTask && currentTask.title) lineTasks.push(currentTask);
      const titleMatch = line.match(/task\s*#?\d+:?\s*(.*)/i);
      currentTask = {
        title: titleMatch ? titleMatch[1].trim() : "",
        description: "",
        priority: "Medium",
        dueDate: null,
        checklist: [],
        attachments: [],
        assignTo: null,
      };
      continue;
    }

    if (!currentTask) continue;

    if (/^priority\s*[:\-]?/i.test(line)) {
      const pm = line.match(/priority\s*[:\-]?\s*([a-zA-Z0-9]+)/i);
      if (pm) {
        const p = pm[1].toLowerCase();
        currentTask.priority =
          p.includes("low") || p === "1"
            ? "Low"
            : p.includes("high") || p === "3"
            ? "High"
            : "Medium";
      }
      continue;
    }

    if (/^due\s*date\s*[:\-]?/i.test(line)) {
      const dm = line.match(/due\s*date\s*[:\-]?\s*(\d{4}[\/-]\d{2}[\/-]\d{2})/i);
      if (dm) currentTask.dueDate = dm[1].replace(/\//g, "-");
      continue;
    }

    if (/^assign\s*to\s*[:\-]?/i.test(line)) {
      const am = line.match(/assign\s*to\s*[:\-]?\s*(.*)/i);
      if (am) currentTask.assignTo = am[1].trim();
      continue;
    }

    if (/^description\s*[:\-]?/i.test(line)) {
      const descMatch = line.match(/description\s*[:\-]?\s*(.*)/i);
      if (descMatch) currentTask.description = descMatch[1].trim();
      continue;
    }

    if (/^todo\s+checklist\s*[:\-]?/i.test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        const checkLine = lines[j].trim();
        if (/^(priority|due|description|assign|attachment|task)/i.test(checkLine)) {
          i = j - 1;
          break;
        }
        if (checkLine.startsWith("-") || checkLine.startsWith("•") || checkLine.startsWith("*")) {
          currentTask.checklist.push(checkLine.replace(/^[-•*]\s*/, ""));
        } else if (checkLine && !checkLine.includes(":")) {
          currentTask.checklist.push(checkLine);
        }
      }
      continue;
    }

    if (/^attachment\s*s?\s*[:\-]?/i.test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        const attLine = lines[j].trim();
        if (/^(priority|due|description|assign|todo|task)/i.test(attLine)) {
          i = j - 1;
          break;
        }
        const urlMatch = attLine.match(/([\w\s]+):\s*(https?:\/\/[^\s]+)/i);
        const bareUrlMatch = attLine.match(/(https?:\/\/[^\s]+)/i);
        if (urlMatch) currentTask.attachments.push({ name: urlMatch[1].trim(), url: urlMatch[2].trim() });
        else if (bareUrlMatch) currentTask.attachments.push({ name: "Attachment", url: bareUrlMatch[1].trim() });
      }
      continue;
    }

    if (!currentTask.description && line && !line.match(/^(priority|due|description|assign|todo|attachment|task)/i)) {
      currentTask.description += " " + line;
    }
  }

  if (currentTask && currentTask.title) {
    currentTask.description = currentTask.description.trim();
    lineTasks.push(currentTask);
  }

  return lineTasks;
};

/**
 * Parse unstructured text into tasks
 */
const parseUnstructuredTasks = (pdfText) => {
  const tasks = [];
  const paragraphs = pdfText.split(/\n\n+/).filter((p) => p.trim());

  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.trim());
    if (lines.length === 0) continue;

    const title = lines[0];
    if (title.length < 3) continue;

    const task = {
      title: title.substring(0, 100),
      description: lines.slice(1).join(" ").substring(0, 500),
      priority: "Medium",
      dueDate: null,
      checklist: [],
      attachments: [],
      assignTo: null,
    };

    if (task.description.toLowerCase().includes("high")) task.priority = "High";
    if (task.description.toLowerCase().includes("low")) task.priority = "Low";

    tasks.push(task);
  }

  return tasks;
};

/**
 * Validate extracted tasks
 */
const validateTasks = (tasks) => {
  const validated = [];
  const errors = [];
  const fixes = [];

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    const taskErrors = [];

    // Title validation
    if (!task.title || task.title.trim().length < 3) {
      const autoTitle = `Imported Task ${index + 1}`;
      fixes.push({
        index,
        field: "title",
        from: task.title || "",
        to: autoTitle,
        reason: "auto-generated title",
      });
      task.title = autoTitle;
    }

    // Priority validation
    if (!["Low", "low", "Medium", "medium", "High", "high"].includes(task.priority)) {
      task.priority = "Medium";
    } else {
      task.priority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1).toLowerCase();
    }

    // Due date validation (keep YYYY-MM-DD string)
    if (task.dueDate) {
      const normalizedDate = task.dueDate.replace(/\//g, "-");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        taskErrors.push(`Invalid date format: ${task.dueDate}`);
        task.dueDate = null;
      } else {
        const date = new Date(normalizedDate);
        if (isNaN(date.getTime())) {
          taskErrors.push(`Invalid date value: ${task.dueDate}`);
          task.dueDate = null;
        } else {
          task.dueDate = normalizedDate;
        }
      }
    }

    // Checklist validation -> convert to objects
    if (!Array.isArray(task.checklist)) task.checklist = [];
    task.checklist = task.checklist
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .slice(0, 20)
      .map((item) => ({ text: item.trim(), done: false }));

    // Attachments validation
    if (!Array.isArray(task.attachments)) task.attachments = [];
    task.attachments = task.attachments
      .filter((att) => att.name && att.url && (att.url.startsWith("http://") || att.url.startsWith("https://")))
      .slice(0, 10);

    // Description optional
    if (!task.description) task.description = task.title;

    // assignTo optional
    if (task.assignTo && typeof task.assignTo === "string") {
      task.assignTo = task.assignTo.trim() || null;
    } else {
      task.assignTo = null;
    }

    if (taskErrors.length > 0) errors.push({ index, reason: taskErrors.join("; ") });
    else validated.push(task);
  }

  return { validated, errors, fixes };
};

/**
 * Main function: Parse PDF and return tasks
 */
const parsePdfTasks = async (pdfBuffer, useOpenAI = false) => {
  try {
    const pdfText = await extractTextFromPdf(pdfBuffer);

    console.log("[PDF Import][debug] raw pdfParse text:\n", pdfText);

    if (!pdfText.trim()) throw new Error("PDF appears to be empty or unreadable");

    let extractedTasks = [];

    if (useOpenAI && openaiClient) {
      try {
        extractedTasks = await extractTasksWithLLM(pdfText);
      } catch (llmError) {
        console.warn("LLM extraction failed, falling back to rules:", llmError.message);
        extractedTasks = extractTasksWithRules(pdfText);
      }
    } else {
      extractedTasks = extractTasksWithRules(pdfText);
    }

    if (extractedTasks.length === 0) {
      throw new Error("No tasks could be extracted from the PDF (check format: Task #, Priority, Due Date, Description)");
    }

    const { validated, errors, fixes } = validateTasks(extractedTasks);

    console.log(
      "[PDF Import][debug] extracted checklists:",
      validated.map((t, idx) => ({ index: idx, title: t.title, checklist: t.checklist }))
    );

    return {
      tasks: validated,
      errors,
      totalExtracted: extractedTasks.length,
      validCount: validated.length,
      errorCount: errors.length,
      fixes,
    };
  } catch (error) {
    throw new Error(`PDF parsing service error: ${error.message}`);
  }
};

module.exports = {
  extractTextFromPdf,
  parsePdfTasks,
  validateTasks,
  extractTasksWithLLM,
  extractTasksWithRules,

  // helpers export
  normalizeText,
  normalizeTitle,
  splitIntoTaskBlocks,
  extractTitle,
  extractPriority,
  extractDueDate,
  extractDescription,
  extractChecklist,
  extractAttachments,
  extractAssignTo,

  // legacy (if you still use it elsewhere)
  parseUnstructuredTasks,
};
