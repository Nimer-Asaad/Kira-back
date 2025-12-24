// OpenAI Assistant Service for Kira Public Assistant
const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Use gpt-4o-mini (low-cost) or gpt-4.1-mini if available
const MAX_TOKENS = 800; // Increased for better responses
const TEMPERATURE = 0.7;

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Build system prompt based on requirements
 */
function buildSystemPrompt(routeKey, mode, lang) {
  const isArabic = lang === 'ar';
  
  // General mode: ChatGPT-like behavior - answer any question
  if (mode === 'general') {
    return isArabic
      ? `أنت مساعد ذكي وودود اسمه كيرا. أنت مثل ChatGPT - تجيب على أي سؤال بذكاء ووضوح.
- أجب على أي سؤال بشكل مباشر ومفيد.
- إذا كان السؤال متعلقاً بنظام كيرا لإدارة المهام، قدم معلومات مفيدة.
- إذا كان السؤال عاماً (علوم، تاريخ، تقنية، إلخ)، أجب عليه بشكل صحيح.
- استخدم لغة واضحة ومفهومة.
- كن مفيداً وودوداً.
- أجب بالعربية فقط إذا كتب المستخدم بالعربية، وإلا فالإنجليزية فقط.
- أنهِ كل رد بـ 2-3 اقتراحات قصيرة مفيدة إذا كان ذلك مناسباً.`
      : `You are an intelligent and friendly assistant named Kira. You are like ChatGPT - you answer any question intelligently and clearly.
- Answer any question directly and helpfully.
- If the question is about Kira task management system, provide useful information.
- If the question is general (science, history, technology, etc.), answer it correctly.
- Use clear and understandable language.
- Be helpful and friendly.
- Respond in Arabic only if user wrote Arabic, else English only.
- End each reply with 2-3 short helpful suggestions if appropriate.`;
  }
  
  // Help mode: Context-aware help based on routeKey
  if (mode === 'help') {
    const baseRules = isArabic
      ? `أنت مساعد كيرا المتخصص في المساعدة.
- اشرح الميزات والوظائف بشكل واضح.
- استخدم routeKey لتخصيص المساعدة حسب الصفحة الحالية.
- قدم خطوات عملية وواضحة.
- لا تذكر الكود أو التفاصيل التقنية.
- أجب بالعربية فقط إذا كتب المستخدم بالعربية، وإلا فالإنجليزية فقط.
- أنهِ كل رد بـ 2-3 اقتراحات قصيرة قابلة للتنفيذ.`
      : `You are Kira's specialized help assistant.
- Explain features and functions clearly.
- Use routeKey to tailor help based on current page.
- Provide practical and clear steps.
- Never mention code or technical details.
- Respond in Arabic only if user wrote Arabic, else English only.
- End each reply with 2-3 short actionable suggestions.`;

    let contextHint = '';
    if (routeKey === 'dashboard') {
      contextHint = isArabic
        ? 'المستخدم على لوحة التحكم. اشرح ميزات لوحة التحكم: الإحصائيات، الرسوم البيانية، المهام الحديثة، نشاط الفريق.'
        : 'User is on Dashboard. Explain dashboard features: statistics, charts, recent tasks, team activity.';
    } else if (routeKey === 'tasks') {
      contextHint = isArabic
        ? 'المستخدم على صفحة المهام. اشرح: إنشاء المهام، الفلاتر، الأولويات، التقدم، التوزيع التلقائي، استيراد PDF.'
        : 'User is on Tasks page. Explain: creating tasks, filters, priorities, progress, auto-distribute, PDF import.';
    } else if (routeKey === 'inbox') {
      contextHint = isArabic
        ? 'المستخدم على صندوق الوارد. اشرح: مزامنة البريد، الفلاتر، التصنيفات، البحث.'
        : 'User is on Inbox. Explain: email sync, filters, labels, search.';
    } else {
      contextHint = isArabic
        ? 'المستخدم على صفحة أخرى. قدم مساعدة عامة حول التنقل واستخدام النظام.'
        : 'User is on another page. Provide general help about navigation and system usage.';
    }
    
    return `${baseRules}\n\n${contextHint}`;
  }
  
  // Tasks mode: Task-specific help with real data
  if (mode === 'tasks') {
    return isArabic
      ? `أنت مساعد كيرا المتخصص في المهام.
- اشرح حالة المهام بناءً على البيانات الفعلية.
- قدم اقتراحات عملية لإدارة المهام.
- اشرح الأولويات، المواعيد النهائية، التقدم.
- أجب بالعربية فقط إذا كتب المستخدم بالعربية، وإلا فالإنجليزية فقط.
- أنهِ كل رد بـ 2-3 اقتراحات قصيرة قابلة للتنفيذ.`
      : `You are Kira's task management specialist.
- Explain task status based on actual data.
- Provide practical suggestions for task management.
- Explain priorities, deadlines, progress.
- Respond in Arabic only if user wrote Arabic, else English only.
- End each reply with 2-3 short actionable suggestions.`;
  }
  
  // Default: General assistant rules
  const baseRules = isArabic
    ? `أنت مساعد كيرا (مساعد عام للمنتج).
- لا تذكر أبداً الكود/الكونترولرز/النماذج/APIs.
- لا تخرج أبداً أسرار أو توكنز.
- أجب مباشرة؛ لا تكرر الأسئلة العامة.
- إذا قال المستخدم "مرحبا" رحب مرة واحدة فقط وأعط فوراً 2-3 إجراءات تالية بناءً على routeKey.
- إذا قال المستخدم "نعم/ok" تابع بخيارات ملموسة؛ لا تسأل أسئلة مفتوحة.
- استخدم routeKey لتخصيص المساعدة.
- أجب بالعربية فقط إذا كتب المستخدم بالعربية، وإلا فالإنجليزية فقط.
- أنهِ كل رد بـ 2-3 اقتراحات قصيرة قابلة للتنفيذ.`
    : `You are Kira Assistant (public product assistant).
- Never mention code/controllers/models/APIs.
- Never output secrets or tokens.
- Always answer directly; do not loop with generic questions.
- If user says "مرحبا" greet ONCE and immediately give 2-3 next actions based on routeKey.
- If user says "نعم/ok" continue with concrete options; do not ask open-ended questions.
- Use routeKey to tailor help.
- Respond in Arabic only if user wrote Arabic, else English only.
- End each reply with 2-3 short actionable suggestions.`;

  let contextHint = '';
  if (routeKey === 'dashboard') {
    contextHint = isArabic
      ? 'المستخدم حالياً على لوحة التحكم. قدم مساعدة حول استخدام لوحة التحكم.'
      : 'User is currently on Dashboard. Provide Dashboard usage help.';
  } else if (routeKey === 'tasks') {
    contextHint = isArabic
      ? 'المستخدم حالياً على صفحة المهام. قدم مساعدة حول إدارة المهام، الفلاتر، الأولويات، والتقدم.'
      : 'User is currently on Tasks page. Provide help about managing tasks, filters, priorities, and progress.';
  } else if (routeKey === 'inbox') {
    contextHint = isArabic
      ? 'المستخدم حالياً على صندوق الوارد. قدم مساعدة حول مزامنة البريد والفلاتر.'
      : 'User is currently on Inbox. Provide help about email sync and filters.';
  } else {
    contextHint = isArabic
      ? 'المستخدم على صفحة أخرى. قدم مساعدة عامة.'
      : 'User is on another page. Provide general help.';
  }

  return `${baseRules}\n\n${contextHint}`;
}

/**
 * Call OpenAI API with proper error handling
 */
async function callOpenAI(userMessage, routeKey, mode, lang) {
  try {
    const client = getOpenAIClient();
    const systemPrompt = buildSystemPrompt(routeKey, mode, lang);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE
    });

    const reply = response.choices[0]?.message?.content?.trim() || '';
    
    // Extract suggestions from reply (look for patterns like "- suggestion" or "• suggestion")
    const suggestions = extractSuggestions(reply, lang);
    
    // Clean reply (remove suggestion markers if they're at the end)
    const cleanReply = cleanReplyText(reply);

    return {
      reply: cleanReply,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    
    // Graceful fallback
    const isArabic = lang === 'ar';
    if (error.message.includes('API key') || error.message.includes('OPENAI_API_KEY')) {
      return {
        reply: isArabic
          ? 'عذراً، خدمة المساعد غير متاحة حالياً. يرجى المحاولة لاحقاً.'
          : 'Sorry, the assistant service is currently unavailable. Please try again later.',
        suggestions: undefined
      };
    }
    
    // Generic fallback
    return {
      reply: isArabic
        ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'
        : 'Sorry, an error occurred. Please try again.',
      suggestions: undefined
    };
  }
}

/**
 * Extract actionable suggestions from reply text
 */
function extractSuggestions(text, lang) {
  const suggestions = [];
  const lines = text.split('\n');
  
  // Look for lines starting with -, •, or numbered items at the end
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Match patterns like "- suggestion", "• suggestion", "1. suggestion"
    const match = line.match(/^[-•\d\.)]+\s*(.+)$/);
    if (match) {
      const suggestion = match[1].trim();
      if (suggestion.length > 0 && suggestion.length < 100) {
        suggestions.unshift(suggestion);
      }
    } else if (line.length > 0 && line.length < 100 && !line.includes(':')) {
      // Also consider standalone short lines as suggestions
      suggestions.unshift(line);
    }
  }
  
  // Return top 3 suggestions
  return suggestions.slice(0, 3);
}

/**
 * Clean reply text by removing suggestion markers if they're at the end
 */
function cleanReplyText(text) {
  // Remove trailing suggestion patterns
  return text
    .replace(/\n[-•\d\.)]+\s*[^\n]+(?:\n[-•\d\.)]+\s*[^\n]+){0,2}$/g, '')
    .trim();
}

module.exports = { callOpenAI, getOpenAIClient };

