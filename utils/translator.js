const crypto = require('crypto');
const axios = require('axios');
const Translation = require('../models/Translation');

// In-memory cache (fast access)
const memoryCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate cache key from text
 */
const generateCacheKey = (text, targetLang = 'ar') => {
  const hash = crypto.createHash('sha256').update(text.toLowerCase()).digest('hex');
  return `${targetLang}:${hash}`;
};

/**
 * Detect if text should NOT be translated (email, ID, number, date, etc.)
 */
const shouldSkipTranslation = (text) => {
  if (!text || typeof text !== 'string') return true;

  // Too short or already Arabic
  if (text.length < 2) return true;
  if (/[\u0600-\u06FF]/.test(text)) return true; // Arabic characters

  // Patterns to skip: email, URL, number, date, special formats
  const skipPatterns = [
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Email
    /^https?:\/\//, // URL
    /^\d+$/, // Pure number
    /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/, // Date format
    /^[A-Z0-9]{8,}$/, // ID-like (all caps + numbers)
    /^_(id|ID|Id)$/, // MongoDB ID markers
    /^[\d\.\,\%\$\€]*$/, // Currency, numbers with formatting
  ];

  return skipPatterns.some((pattern) => pattern.test(text.trim()));
};

/**
 * Get translation from memory cache
 */
const getMemoryCache = (key) => {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.translation;
  }
  if (cached) {
    memoryCache.delete(key);
  }
  return null;
};

/**
 * Set memory cache
 */
const setMemoryCache = (key, translation) => {
  memoryCache.set(key, {
    translation,
    timestamp: Date.now(),
  });
};

/**
 * Get translation from MongoDB
 */
const getMongoCache = async (key) => {
  try {
    const doc = await Translation.findOne({ key });
    if (doc) {
      setMemoryCache(key, doc.translatedText); // Also update memory cache
      return doc.translatedText;
    }
  } catch (error) {
    console.error('Error fetching translation from MongoDB:', error);
  }
  return null;
};

/**
 * Save translation to MongoDB
 */
const saveMongoCache = async (key, originalText, translatedText, provider = 'openai') => {
  try {
    await Translation.updateOne(
      { key },
      {
        $set: {
          key,
          originalText,
          translatedText,
          targetLanguage: 'ar',
          provider,
          cached: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving translation to MongoDB:', error);
  }
};

/**
 * Translate text using OpenAI
 */
const translateWithOpenAI = async (text) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the following English text to Arabic. Return ONLY the translated text, nothing else.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI translation error:', error.message);
    throw error;
  }
};

/**
 * Translate text with caching
 */
const translateText = async (text, targetLang = 'ar') => {
  // Skip translation for certain patterns
  if (shouldSkipTranslation(text)) {
    return text;
  }

  const cacheKey = generateCacheKey(text, targetLang);

  // Check memory cache first
  const memCached = getMemoryCache(cacheKey);
  if (memCached) {
    return memCached;
  }

  // Check MongoDB cache
  const mongoCached = await getMongoCache(cacheKey);
  if (mongoCached) {
    return mongoCached;
  }

  // Translate using provider
  try {
    const translated = await translateWithOpenAI(text);

    // Cache the result
    setMemoryCache(cacheKey, translated);
    await saveMongoCache(cacheKey, text, translated, 'openai');

    return translated;
  } catch (error) {
    console.error('Translation failed:', error);
    // On error, return original text
    return text;
  }
};

/**
 * Batch translate multiple texts
 */
const translateBatch = async (texts, targetLang = 'ar') => {
  const results = {};
  const toTranslate = {};

  // Check cache for each text
  for (const text of texts) {
    if (!text || typeof text !== 'string') {
      results[text] = text;
      continue;
    }

    const cacheKey = generateCacheKey(text, targetLang);

    // Check memory cache
    const memCached = getMemoryCache(cacheKey);
    if (memCached) {
      results[text] = memCached;
      continue;
    }

    // Mark for translation
    if (!shouldSkipTranslation(text)) {
      toTranslate[text] = cacheKey;
    } else {
      results[text] = text;
    }
  }

  // If nothing to translate, return cached results
  if (Object.keys(toTranslate).length === 0) {
    return results;
  }

  // Check MongoDB for remaining items
  const mongoResults = await Promise.all(
    Object.entries(toTranslate).map(async ([text, cacheKey]) => {
      const mongoCached = await getMongoCache(cacheKey);
      if (mongoCached) {
        results[text] = mongoCached;
      } else {
        return { text, cacheKey };
      }
    })
  );

  const stillNeeded = mongoResults.filter(Boolean);

  // Translate remaining texts
  for (const { text, cacheKey } of stillNeeded) {
    try {
      const translated = await translateWithOpenAI(text);
      results[text] = translated;
      setMemoryCache(cacheKey, translated);
      await saveMongoCache(cacheKey, text, translated, 'openai');
    } catch (error) {
      console.error(`Failed to translate "${text}":`, error.message);
      results[text] = text;
    }
  }

  return results;
};

/**
 * Clear caches
 */
const clearCaches = async () => {
  memoryCache.clear();
  try {
    await Translation.deleteMany({});
  } catch (error) {
    console.error('Error clearing MongoDB cache:', error);
  }
};

module.exports = {
  generateCacheKey,
  shouldSkipTranslation,
  getMemoryCache,
  setMemoryCache,
  getMongoCache,
  saveMongoCache,
  translateText,
  translateBatch,
  clearCaches,
};
