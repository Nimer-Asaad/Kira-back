const { google } = require('googleapis');

let gmailClient = null;
let authClient = null;

const initializeGmailClient = () => {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return null;
  }

  try {
    authClient = new google.auth.OAuth2(clientId, clientSecret, process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback');
    authClient.setCredentials({
      refresh_token: refreshToken,
    });

    gmailClient = google.gmail({ version: 'v1', auth: authClient });
    return gmailClient;
  } catch (err) {
    console.error('Gmail client initialization error:', err.message);
    return null;
  }
};

const getGmailClient = () => {
  if (!gmailClient) {
    gmailClient = initializeGmailClient();
  }
  return gmailClient;
};

const getAuthClient = () => {
  if (!authClient) {
    initializeGmailClient();
  }
  return authClient;
};

/**
 * Fetch messages from Gmail by label with pagination
 * @param {string} labelId - Gmail label ID (e.g., 'INBOX', 'IMPORTANT')
 * @param {number} maxResults - Number of messages to fetch
 * @param {string} pageToken - Page token for pagination
 * @returns {Promise<{messages, resultSizeEstimate, nextPageToken}>}
 */
const getMessages = async (labelId = 'INBOX', maxResults = 10, pageToken = null) => {
  const client = getGmailClient();
  if (!client) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  try {
    const response = await client.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults,
      pageToken,
      q: 'is:unread', // Optional: fetch unread by default
    });

    return {
      messages: response.data.messages || [],
      resultSizeEstimate: response.data.resultSizeEstimate || 0,
      nextPageToken: response.data.nextPageToken || null,
    };
  } catch (err) {
    console.error('Error fetching messages:', err.message);
    throw err;
  }
};

/**
 * Get full message details including headers and body
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<object>}
 */
const getMessageDetails = async (messageId) => {
  const client = getGmailClient();
  if (!client) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  try {
    const response = await client.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data;
  } catch (err) {
    console.error('Error fetching message details:', err.message);
    throw err;
  }
};

/**
 * Parse message headers to extract from, to, subject, date
 * @param {object} headers - Array of header objects from Gmail API
 * @returns {object}
 */
const parseHeaders = (headers) => {
  const headerMap = {};
  if (headers) {
    headers.forEach((h) => {
      headerMap[h.name] = h.value;
    });
  }

  return {
    from: headerMap['From'] || '',
    to: headerMap['To'] ? headerMap['To'].split(',').map((s) => s.trim()) : [],
    cc: headerMap['Cc'] ? headerMap['Cc'].split(',').map((s) => s.trim()) : [],
    bcc: headerMap['Bcc'] ? headerMap['Bcc'].split(',').map((s) => s.trim()) : [],
    subject: headerMap['Subject'] || '(no subject)',
    date: new Date(headerMap['Date'] || new Date()),
  };
};

/**
 * Extract text body from MIME structure
 * @param {object} payload - Message payload from Gmail API
 * @returns {string}
 */
const extractBody = (payload) => {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    try {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } catch (e) {
      return '';
    }
  }

  if (payload.parts) {
    for (let part of payload.parts) {
      const extracted = extractBody(part);
      if (extracted) return extracted;
    }
  }

  if (payload.body && payload.body.data) {
    try {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } catch (e) {
      return '';
    }
  }

  return '';
};

/**
 * Check if message has attachments
 * @param {object} payload - Message payload
 * @returns {boolean}
 */
const hasAttachments = (payload) => {
  if (!payload || !payload.parts) return false;
  return payload.parts.some((part) => part.filename && part.filename.length > 0);
};

module.exports = {
  initializeGmailClient,
  getGmailClient,
  getAuthClient,
  getMessages,
  getMessageDetails,
  parseHeaders,
  extractBody,
  hasAttachments,
};
