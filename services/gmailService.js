const { google } = require('googleapis');
const dbManager = require('./dbManager');

// ===== OAuth2 Client Creation =====
function createOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth not configured in .env');
  }

  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// ===== Token Management =====
async function saveGmailTokens(userId, tokens) {
  await dbManager.updateUser(userId, {
    gmailAccessToken: tokens.access_token,
    gmailRefreshToken: tokens.refresh_token,
    gmailTokenExpiry: tokens.expiry_date,
  });
}

async function getOAuth2ClientForUser(userId) {
  const user = await dbManager.findUserById(userId);
  if (!user || !user.gmailAccessToken || !user.gmailRefreshToken) {
    throw new Error('No Gmail tokens stored for this user');
  }

  const oAuth2Client = createOAuth2Client();

  oAuth2Client.setCredentials({
    access_token: user.gmailAccessToken,
    refresh_token: user.gmailRefreshToken,
    expiry_date: user.gmailTokenExpiry,
  });

  // Auto-refresh tokens if needed
  oAuth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await saveGmailTokens(userId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || user.gmailRefreshToken,
        expiry_date: tokens.expiry_date || user.gmailTokenExpiry,
      });
    }
  });

  return oAuth2Client;
}

async function getGmailClientForUser(userId) {
  const oAuth2Client = await getOAuth2ClientForUser(userId);
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function getAttachmentForUser(userId, messageId, attachmentId) {
  const gmail = await getGmailClientForUser(userId);
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res?.data?.data;
  if (!data) throw new Error('Attachment not found');
  return Buffer.from(data, 'base64');
}

// ===== Message Parsing =====
function decodeBase64Url(str) {
  if (!str) return '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractMessageBody(payload) {
  if (!payload) return { html: '', text: '' };

  let html = '';
  let text = '';

  function walk(part) {
    if (!part) return;

    if (part.mimeType === 'text/html' && part.body?.data) {
      try {
        html = decodeBase64Url(part.body.data);
      } catch (e) {
        console.error('Failed to decode HTML part:', e);
      }
    }

    if (part.mimeType === 'text/plain' && part.body?.data) {
      try {
        text = decodeBase64Url(part.body.data);
      } catch (e) {
        console.error('Failed to decode TEXT part:', e);
      }
    }

    if (part.parts?.length) {
      part.parts.forEach(walk);
    }
  }

  walk(payload);
  return { html, text };
}

function extractAttachments(payload) {
  let hasAttachments = false;
  const attachments = [];

  function findAttachments(part) {
    if (part.filename && part.body?.attachmentId) {
      hasAttachments = true;
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      part.parts.forEach(findAttachments);
    }
  }

  if (payload) {
    findAttachments(payload);
  }

  return { hasAttachments, attachments };
}

// Score CV likelihood (0-1) based on filename, mimeType, subject, and body
function scoreCvLikelihood(filename, mimeType, subject, snippet, bodyText) {
  let score = 0.5; // Base score
  
  const fullText = `${subject || ''} ${snippet || ''} ${bodyText || ''}`.toLowerCase();
  const filenameLower = (filename || '').toLowerCase();
  
  // Positive CV indicators
  const cvKeywords = [
    'cv', 'resume', 'résumé', 'curriculum vitae',
    'application', 'job', 'position', 'candidate', 'hiring',
    'attached', 'portfolio', 'experience', 'qualification'
  ];
  const cvMatches = cvKeywords.filter(kw => fullText.includes(kw)).length;
  score += Math.min(cvMatches * 0.08, 0.25);
  
  // Negative indicators
  const negativeKeywords = [
    'assignment', 'homework', 'coursework', 'exam',
    'invoice', 'receipt', 'payment', 'brochure', 'statement',
    'promotion', 'newsletter', 'marketing'
  ];
  const negativeMatches = negativeKeywords.filter(kw => fullText.includes(kw)).length;
  score -= negativeMatches * 0.15;
  
  // Filename indicators
  if (filenameLower.includes('cv') || filenameLower.includes('resume') || filenameLower.includes('résum')) {
    score += 0.2;
  }
  if (filenameLower.includes('invoice') || filenameLower.includes('receipt') || filenameLower.includes('statement')) {
    score -= 0.25;
  }
  
  // PDF is positive signal for CV
  if (filenameLower.endsWith('.pdf')) {
    score += 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}

// Pick best PDF attachment for CV based on scoring
function pickBestPdfAttachment(attachments, subject, snippet, bodyText) {
  if (!attachments || attachments.length === 0) return null;
  
  const pdfs = attachments.filter(att => {
    const name = (att.filename || '').toLowerCase();
    const mime = (att.mimeType || '').toLowerCase();
    return name.endsWith('.pdf') || mime.includes('pdf');
  });
  
  if (pdfs.length === 0) return null;
  if (pdfs.length === 1) return pdfs[0];
  
  // Score each PDF and pick the best
  let bestPdf = pdfs[0];
  let bestScore = scoreCvLikelihood(bestPdf.filename, bestPdf.mimeType, subject, snippet, bodyText);
  
  for (let i = 1; i < pdfs.length; i++) {
    const score = scoreCvLikelihood(pdfs[i].filename, pdfs[i].mimeType, subject, snippet, bodyText);
    if (score > bestScore) {
      bestScore = score;
      bestPdf = pdfs[i];
    }
  }
  
  return bestPdf;
}

// ===== Email Analysis =====
async function scoreEmail({ text, requirements }) {
  const lowerText = text.toLowerCase();
  const words = requirements
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  let matches = 0;
  for (const w of words) {
    if (lowerText.includes(w)) matches++;
  }

  const score = words.length === 0 ? 0 : Math.round((matches / words.length) * 100);

  let decision = 'Reject';
  if (score >= 70) decision = 'Shortlist';
  else if (score >= 40) decision = 'Maybe';

  const firstLine = text.split('\n')[0] || '';

  return {
    candidateName: firstLine.slice(0, 40) || 'Unknown',
    position: '',
    score,
    decision,
  };
}

function detectCV(subject, snippet, text, hasAttachments) {
  const combinedText = `${subject} ${snippet} ${text}`.toLowerCase();
  const cvKeywords = ['cv', 'resume', 'curriculum vitae', 'سيرة ذاتية', 'application', 'candidate'];
  return cvKeywords.some((kw) => combinedText.includes(kw)) && hasAttachments;
}

function calculateGmailPriority(labels, isStarred, isImportant, isUnread, emailDate, gmailCategory, hasAttachments) {
  let priority = 0;

  if (isStarred) priority += 100;
  if (isImportant) priority += 50;
  if (isUnread) priority += 10;
  if (gmailCategory === 'Primary') priority += 30;
  if (hasAttachments) priority += 5;

  // Recent emails get priority boost
  const daysSinceEmail = (Date.now() - emailDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceEmail < 7) priority += 20;
  else if (daysSinceEmail < 30) priority += 10;

  return priority;
}

function getGmailImportance(isStarred, isImportant, gmailCategory) {
  if (isStarred || isImportant) return 'high';
  if (gmailCategory !== 'Primary') return 'low';
  return 'normal';
}

function getGmailCategory(labels) {
  if (labels.includes('CATEGORY_SOCIAL')) return 'Social';
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'Promotions';
  if (labels.includes('CATEGORY_UPDATES')) return 'Updates';
  if (labels.includes('CATEGORY_FORUMS')) return 'Forums';
  return 'Primary';
}

module.exports = {
  createOAuth2Client,
  saveGmailTokens,
  getOAuth2ClientForUser,
  getGmailClientForUser,
  getAttachmentForUser,
  decodeBase64Url,
  extractMessageBody,
  extractAttachments,
  scoreEmail,
  detectCV,
  scoreCvLikelihood,
  pickBestPdfAttachment,
  calculateGmailPriority,
  getGmailImportance,
  getGmailCategory,
};
