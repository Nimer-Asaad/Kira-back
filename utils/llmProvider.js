// Optional LLM provider integration
exports.getLLMProvider = () => {
  return process.env.ASSISTANT_PROVIDER === 'openai' ? 'openai' : null;
};

exports.callLLM = async (prompt, lang = 'en') => {
  // Only call if provider is set (stub for now)
  // In real use, call OpenAI API with safe prompt
  return prompt;
};
