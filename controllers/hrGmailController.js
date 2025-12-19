const Email = require('../models/Email');
const SyncState = require('../models/SyncState');
const {
  getGmailClient,
  getMessages,
  getMessageDetails,
  parseHeaders,
  extractBody,
  hasAttachments,
} = require('../services/gmailClient');
const { getJsonFromText } = require('../services/openaiClient');

/**
 * GET /api/hr/gmail/status
 * Returns connection status and last sync info
 */
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const client = getGmailClient();

    if (!client) {
      return res.status(503).json({
        status: 'not_configured',
        message: 'Gmail not configured. Missing GOOGLE_REFRESH_TOKEN or credentials.',
      });
    }

    const syncState = await SyncState.findOne({ userId });

    res.status(200).json({
      status: 'connected',
      lastSync: syncState ? syncState.lastSyncedAt : null,
      syncedCount: syncState ? syncState.syncedCount : 0,
      totalMessages: syncState ? syncState.totalMessages : 0,
    });
  } catch (err) {
    console.error('Error getting Gmail status:', err.message);
    res.status(500).json({ error: 'Failed to get Gmail status', details: err.message });
  }
};

/**
 * POST /api/hr/gmail/sync
 * Sync emails from Gmail by label (default INBOX)
 * Body: { label: "INBOX", maxResults: 10 }
 */
exports.syncEmails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { label = 'INBOX', maxResults = 10 } = req.body;

    const client = getGmailClient();
    if (!client) {
      return res.status(503).json({
        error: 'Gmail not configured',
        message: 'Missing GOOGLE_REFRESH_TOKEN or credentials.',
      });
    }

    // Get or create sync state
    let syncState = await SyncState.findOne({ userId, scope: label });
    if (!syncState) {
      syncState = await SyncState.create({
        userId,
        scope: label,
      });
    }

    // Fetch messages from Gmail
    const { messages, resultSizeEstimate, nextPageToken } = await getMessages(
      label,
      maxResults,
      syncState.pageToken
    );

    if (!messages || messages.length === 0) {
      syncState.lastSyncedAt = new Date();
      syncState.totalMessages = resultSizeEstimate;
      await syncState.save();

      return res.status(200).json({
        message: 'No new emails to sync',
        syncedCount: 0,
        totalMessages: resultSizeEstimate,
      });
    }

    let syncedCount = 0;

    // Process each message
    for (const msg of messages) {
      try {
        const fullMessage = await getMessageDetails(msg.id);
        const headers = parseHeaders(fullMessage.payload?.headers);
        const body = extractBody(fullMessage.payload);

        const emailData = {
          userId,
          gmailId: msg.id,
          threadId: fullMessage.threadId || null,
          from: headers.from,
          to: headers.to,
          cc: headers.cc,
          bcc: headers.bcc,
          subject: headers.subject,
          snippet: fullMessage.snippet || '',
          body: body || '',
          date: headers.date,
          internalDate: fullMessage.internalDate,
          labelIds: fullMessage.labelIds || [],
          hasAttachments: hasAttachments(fullMessage.payload),
          isRead: !fullMessage.labelIds?.includes('UNREAD'),
          isStarred: fullMessage.labelIds?.includes('STARRED') || false,
          lastModifiedTime: fullMessage.historyId,
        };

        // Upsert email
        await Email.updateOne({ gmailId: msg.id }, emailData, { upsert: true });
        syncedCount++;
      } catch (msgErr) {
        console.error(`Error processing message ${msg.id}:`, msgErr.message);
      }
    }

    // Update sync state
    syncState.lastSyncedAt = new Date();
    syncState.pageToken = nextPageToken || null;
    syncState.totalMessages = resultSizeEstimate;
    syncState.syncedCount = (syncState.syncedCount || 0) + syncedCount;
    await syncState.save();

    res.status(200).json({
      message: 'Sync completed',
      syncedCount,
      totalMessages: resultSizeEstimate,
      hasMore: !!nextPageToken,
    });
  } catch (err) {
    console.error('Error syncing emails:', err.message);
    res.status(500).json({ error: 'Failed to sync emails', details: err.message });
  }
};

/**
 * GET /api/hr/gmail/emails
 * List cached emails with filters
 * Query: { q: "search", label: "INBOX", page: 1, limit: 20 }
 */
exports.listEmails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { q = '', label = 'INBOX', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { userId };

    // Search by subject or from
    if (q) {
      query.$or = [
        { subject: { $regex: q, $options: 'i' } },
        { from: { $regex: q, $options: 'i' } },
      ];
    }

    // Filter by label
    if (label !== 'ALL') {
      query.labelIds = label;
    }

    const total = await Email.countDocuments(query);
    const emails = await Email.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-body -raw')
      .lean();

    res.status(200).json({
      emails,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Error listing emails:', err.message);
    res.status(500).json({ error: 'Failed to list emails', details: err.message });
  }
};

/**
 * GET /api/hr/gmail/emails/:id
 * Get single email details
 */
exports.getEmailDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const email = await Email.findOne({ _id: id, userId }).lean();

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.status(200).json(email);
  } catch (err) {
    console.error('Error fetching email details:', err.message);
    res.status(500).json({ error: 'Failed to fetch email', details: err.message });
  }
};

/**
 * POST /api/hr/gmail/emails/:id/ai
 * Generate AI summary for email
 */
exports.generateEmailSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const email = await Email.findOne({ _id: id, userId });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (!email.body || email.body.trim().length === 0) {
      return res.status(400).json({ error: 'Email body is empty; cannot generate summary' });
    }

    const systemPrompt = `You are an HR assistant. Analyze the following email and provide a structured summary in strict JSON format:
{
  "summary": "Brief summary of the email (max 100 words)",
  "key_points": ["point 1", "point 2", "point 3"],
  "action_items": ["action 1", "action 2"],
  "urgency": "low|medium|high",
  "suggested_stage": "applied|screening|interview|offer|hired|rejected|unknown"
}

Urgency: Determine based on tone, keywords like "urgent", "ASAP", etc.
Suggested stage: Guess the recruitment stage this email refers to. If unclear, use "unknown".
Response MUST be valid JSON only, no markdown, no extra text.`;

    const emailContent = `From: ${email.from}
To: ${email.to.join(', ')}
Subject: ${email.subject}
Date: ${email.date}

${email.body}`;

    const summary = await getJsonFromText(systemPrompt, emailContent);

    email.aiSummary = {
      ...summary,
      generatedAt: new Date(),
    };

    await email.save();

    res.status(200).json({
      message: 'AI summary generated',
      aiSummary: email.aiSummary,
    });
  } catch (err) {
    console.error('Error generating AI summary:', err.message);

    if (err.message === 'OPENAI_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'OpenAI not configured',
        message: 'Missing OPENAI_API_KEY',
      });
    }

    res.status(500).json({ error: 'Failed to generate summary', details: err.message });
  }
};
