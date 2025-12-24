// Remove tokens, keys, etc.
exports.sanitizeTokens = (text) => {
  if (!text) return '';
  // Remove Bearer tokens, long keys, etc.
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, '***')
    .replace(/[A-Za-z0-9\-\._~]{32,}/g, '***');
};

// Simple in-memory rate limit (per user, per minute)
const userHits = {};
exports.rateLimitCheck = (userId) => {
  const now = Date.now();
  if (!userHits[userId]) userHits[userId] = [];
  userHits[userId] = userHits[userId].filter(ts => now - ts < 60000);
  if (userHits[userId].length >= 10) throw new Error('Rate limit exceeded');
  userHits[userId].push(now);
};
