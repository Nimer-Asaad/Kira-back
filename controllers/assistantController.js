const assistantService = require('../services/assistantService');
const { validateAssistantInput } = require('../middlewares/assistantValidation');

exports.handlePublicAssistant = async (req, res) => {
  try {
    // Validate input
    const { error, value } = validateAssistantInput(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // RBAC: Only allow for authenticated users
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Enforce max length (already in validation, but double-check)
    const message = value.message.trim();
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long. Maximum 2000 characters.' });
    }

    // Sanitize message (mask tokens/secrets)
    const sanitizedMessage = assistantService.sanitizeMessage(message);
    
    const context = value.context || {};
    const mode = value.mode;
    
    // Use in-memory session (no express-session needed)
    const session = {};

    // Call assistant service
    const result = await assistantService.handle({
      mode,
      message: sanitizedMessage,
      context,
      user,
      session
    });
    
    // Ensure response format
    return res.json({
      reply: result.reply || 'Sorry, I couldn\'t process your request.',
      suggestions: result.suggestions || undefined
    });
  } catch (err) {
    // Log error for debugging
    console.error('Assistant error:', err.message, err.stack);
    
    // Return user-friendly error message
    if (err.message === 'Rate limit exceeded') {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
    
    if (err.message && err.message.includes('OPENAI_API_KEY')) {
      return res.status(500).json({ 
        error: 'Assistant service is not configured properly.',
        reply: 'Sorry, the assistant is temporarily unavailable. Please try again later.'
      });
    }
    
    // Generic fallback
    return res.status(500).json({ 
      error: 'Internal server error',
      reply: 'Sorry, something went wrong. Please try again.'
    });
  }
};
