// SMART Public Kira Assistant Service
const Task = require('../models/Task');
const { getDraftTemplate } = require('../templates/assistantTemplates');
const { sanitizeTokens, rateLimitCheck } = require('../utils/assistantUtils');
const { callOpenAI } = require('./openaiAssistant');

exports.sanitizeMessage = sanitizeTokens;

// Session memory to prevent repetitive greetings
const sessionMemory = new Map();

/**
 * Main handler for assistant requests
 */
exports.handle = async ({ mode, message, context, user, session }) => {
  // Rate limiting
  rateLimitCheck(user._id);

  // Detect language
  const lang = detectLang(message);
  const routeKey = context.routeKey || 'other';
  
  // Get or create session memory
  const sessionId = user._id.toString();
  if (!sessionMemory.has(sessionId)) {
    sessionMemory.set(sessionId, { greeted: false, lastGreeting: null });
  }
  const memory = sessionMemory.get(sessionId);

  // Handle draft mode (templates only, no LLM)
  if (mode === 'draft') {
    const { draftType, fields, language, tone } = context;
    const draft = getDraftTemplate(draftType, fields, language || lang, tone);
    const draftText = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body;
    return { reply: draftText, suggestions: undefined, lang: language || lang };
  }

  // Handle tasks mode - fetch real task data and use LLM to summarize
  if (mode === 'tasks') {
    const taskSummary = await summarizeTasks(user, context);
    const lang = detectLang(message);
    
    // Use OpenAI to create a natural summary
    const userMessage = message.trim().toLowerCase();
    let prompt = '';
    
    if (lang === 'ar') {
      if (/شو اليوم|ماذا اليوم|اليوم|today/i.test(userMessage)) {
        prompt = `لدي ${taskSummary.today} مهام مستحقة اليوم، ${taskSummary.overdue} متأخرة، ${taskSummary.upcoming} قادمة، و ${taskSummary.highPriority} عالية الأولوية. اشرح الوضع وأعطني اقتراحات عملية.`;
      } else {
        prompt = `لدي ${taskSummary.overdue} مهام متأخرة، ${taskSummary.today} مستحقة اليوم، ${taskSummary.upcoming} قادمة (خلال 7 أيام)، و ${taskSummary.highPriority} عالية الأولوية. اشرح الوضع بناءً على سؤالي: "${message}"`;
      }
    } else {
      if (/what.*today|today|show.*today/i.test(userMessage)) {
        prompt = `I have ${taskSummary.today} tasks due today, ${taskSummary.overdue} overdue, ${taskSummary.upcoming} upcoming, and ${taskSummary.highPriority} high priority. Explain the situation and give me actionable suggestions.`;
      } else {
        prompt = `I have ${taskSummary.overdue} overdue tasks, ${taskSummary.today} due today, ${taskSummary.upcoming} upcoming (next 7 days), and ${taskSummary.highPriority} high priority. Explain the situation based on my question: "${message}"`;
      }
    }
    
    try {
      const result = await callOpenAI(prompt, routeKey, mode, lang);
      return { ...result, lang };
    } catch (error) {
      // Fallback to simple summary
      const summaryText = lang === 'ar'
        ? `لديك ${taskSummary.overdue} مهام متأخرة، ${taskSummary.today} مستحقة اليوم، ${taskSummary.upcoming} قادمة، و ${taskSummary.highPriority} عالية الأولوية.`
        : `You have ${taskSummary.overdue} overdue, ${taskSummary.today} due today, ${taskSummary.upcoming} upcoming, and ${taskSummary.highPriority} high priority tasks.`;
      
      return {
        reply: summaryText,
        suggestions: lang === 'ar'
          ? ['عرض المهام المتأخرة', 'عرض مهام اليوم', 'عرض المهام عالية الأولوية']
          : ['View overdue tasks', 'View today\'s tasks', 'View high priority tasks'],
        lang
      };
    }
  }

  // Handle greetings - only once per session
  const isGreeting = /^(مرحبا|اهلا|hi|hello|hey)$/i.test(message.trim());
  if (isGreeting && !memory.greeted) {
    memory.greeted = true;
    memory.lastGreeting = Date.now();
    
    // Use OpenAI to generate context-aware greeting with suggestions
    const greetingPrompt = lang === 'ar'
      ? `المستخدم قال "مرحبا". رحب مرة واحدة فقط وأعط فوراً 2-3 إجراءات تالية بناءً على routeKey: ${routeKey}`
      : `User said "hello". Greet ONCE and immediately give 2-3 next actions based on routeKey: ${routeKey}`;
    
    try {
      const result = await callOpenAI(greetingPrompt, routeKey, mode, lang);
      return { ...result, lang };
    } catch (error) {
      // Fallback greeting
      if (routeKey === 'dashboard') {
        return {
          reply: lang === 'ar'
            ? 'مرحباً! هذه لوحة التحكم. يمكنك رؤية الإحصائيات والمهام هنا.'
            : 'Hello! This is your dashboard. You can view stats and tasks here.',
          suggestions: lang === 'ar'
            ? ['شرح الإحصائيات', 'عرض المهام', 'مراجعة النشاط']
            : ['Explain stats', 'View tasks', 'Review activity'],
          lang
        };
      }
      return {
        reply: lang === 'ar' ? 'مرحباً! كيف يمكنني مساعدتك؟' : 'Hello! How can I help you?',
        suggestions: undefined,
        lang
      };
    }
  }

  // Handle "yes/ok" responses - continue with concrete options
  const isYes = /^(نعم|ok|yes|yep|yeah)$/i.test(message.trim());
  if (isYes) {
    const continuePrompt = lang === 'ar'
      ? `المستخدم قال "نعم". تابع بخيارات ملموسة بناءً على routeKey: ${routeKey}. لا تسأل أسئلة مفتوحة.`
      : `User said "yes". Continue with concrete options based on routeKey: ${routeKey}. Do not ask open-ended questions.`;
    
    try {
      const result = await callOpenAI(continuePrompt, routeKey, mode, lang);
      return { ...result, lang };
    } catch (error) {
      // Fallback
      return {
        reply: lang === 'ar'
          ? 'إليك بعض الخيارات المتاحة.'
          : 'Here are some available options.',
        suggestions: undefined,
        lang
      };
    }
  }

  // Handle General mode - ChatGPT-like behavior (answer any question)
  if (mode === 'general') {
    try {
      // For general mode, use OpenAI with ChatGPT-like prompt
      const result = await callOpenAI(message, routeKey, mode, lang);
      return { ...result, lang };
    } catch (error) {
      console.error('OpenAI call failed:', error);
      // Graceful fallback
      return {
        reply: lang === 'ar'
          ? 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.'
          : 'Sorry, I couldn\'t process your request. Please try again.',
        suggestions: undefined,
        lang
      };
    }
  }

  // Handle Help mode - context-aware help
  if (mode === 'help') {
    try {
      const result = await callOpenAI(message, routeKey, mode, lang);
      return { ...result, lang };
    } catch (error) {
      console.error('OpenAI call failed:', error);
      // Graceful fallback
      return {
        reply: lang === 'ar'
          ? 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.'
          : 'Sorry, I couldn\'t process your request. Please try again.',
        suggestions: undefined,
        lang
      };
    }
  }

  // All other queries - use OpenAI with full context
  try {
    const result = await callOpenAI(message, routeKey, mode, lang);
    return { ...result, lang };
  } catch (error) {
    console.error('OpenAI call failed:', error);
    // Graceful fallback
    return {
      reply: lang === 'ar'
        ? 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.'
        : 'Sorry, I couldn\'t process your request. Please try again.',
      suggestions: undefined,
      lang
    };
  }
};

/**
 * Summarize user's tasks with RBAC
 */
async function summarizeTasks(user, context) {
  let query = {};
  
  if (user.role === 'admin' || user.role === 'hr') {
    query = { $or: [
      { assignedTo: user._id },
      { createdBy: user._id }
    ] };
  } else {
    query = { assignedTo: user._id };
  }
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const nextWeek = new Date(todayStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const tasks = await Task.find(query).lean();
  
  const overdue = tasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due < todayStart && t.status !== 'completed';
  });
  
  const today = tasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= todayStart && due < todayEnd;
  });
  
  const upcoming = tasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= todayEnd && due <= nextWeek && t.status !== 'completed';
  });
  
  const highPriority = tasks.filter(t => t.priority === 'high' && t.status !== 'completed');
  
  return {
    overdue: overdue.length,
    today: today.length,
    upcoming: upcoming.length,
    highPriority: highPriority.length
  };
}

/**
 * Detect language from text
 */
function detectLang(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}
