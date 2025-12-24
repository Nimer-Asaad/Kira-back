// Kira Assistant GPT-4 integration
// This module handles calls to the OpenAI GPT-4 API with context
const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function askGpt4({ userMessage, context, lang }) {
  // Compose system prompt enforcing Kira Assistant rules
  const systemPrompt = lang === 'ar' ?
    `أنت مساعد ذكي وهادئ لمستخدمي نظام كيرا لإدارة المهام. اشرح الأمور بوضوح وبخطوات. لا تكرر الأسئلة العامة. لا تذكر أي تفاصيل تقنية أو برمجية. استخدم فقط العربية. ركز على ميزات الصفحة الحالية فقط. لا تطرح أسئلة مفتوحة. إذا أجاب المستخدم بنعم، تابع باقتراحات عملية. إذا طلب شرحًا، اشرح بوضوح دون تكرار. السياق: ${JSON.stringify(context)}` :
    `You are an intelligent, calm assistant for Kira Task Management System users. Explain things clearly and step by step. Never repeat generic questions. Never mention technical or implementation details. Use only English. Focus only on features of the current page. Do not ask open-ended questions. If the user says yes, continue with concrete suggestions. If asked to explain, explain fully without looping. Context: ${JSON.stringify(context)}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  const response = await axios.post(OPENAI_API_URL, {
    model: 'gpt-4',
    messages,
    max_tokens: 400,
    temperature: 0.4
  }, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.choices[0].message.content.trim();
}

module.exports = { askGpt4 };