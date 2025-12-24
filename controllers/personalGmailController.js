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
 * GET /api/personal/emails/status
 * Returns connection status and last sync info for personal user
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

    const syncState = await SyncState.findOne({ userId, scope: 'personal_inbox' });

    res.status(200).json({
      status: 'connected',
      lastSync: syncState ? syncState.lastSyncedAt : null,
      syncedCount: syncState ? syncState.syncedCount : 0,
      totalMessages: syncState ? syncState.totalMessages : 0,
    });
  } catch (err) {
    console.error('Error getting personal Gmail status:', err.message);
    res.status(500).json({ error: 'Failed to get Gmail status', details: err.message });
  }
};

/**
 * POST /api/personal/emails/sync
 * Sync emails from Gmail for personal user
 * Body: { label: "INBOX", maxResults: 50 }
 */
exports.syncEmails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { label = 'INBOX', maxResults = 50 } = req.body;

    const client = getGmailClient();
    if (!client) {
      return res.status(503).json({
        error: 'Gmail not configured',
        message: 'Missing GOOGLE_REFRESH_TOKEN or credentials.',
      });
    }

    // Get or create sync state for personal inbox
    let syncState = await SyncState.findOne({ userId, scope: 'personal_inbox' });
    if (!syncState) {
      syncState = await SyncState.create({
        userId,
        scope: 'personal_inbox',
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

        // Check if email already exists
        const existingEmail = await Email.findOne({ 
          gmailId: msg.id,
          $or: [
            { ownerUserId: userId },
            { userId: userId }
          ]
        });

        if (existingEmail) {
          continue; // Skip if already synced
        }

        // Parse from header
        const fromHeader = headers.from || '';
        const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/) || [null, fromHeader, fromHeader];
        const fromName = fromMatch[1]?.trim() || fromHeader;
        const fromEmail = fromMatch[2]?.trim() || fromHeader;

        const emailData = {
          userId: userId, // Keep for backward compatibility
          ownerUserId: userId, // Personal user owns this email
          gmailId: msg.id,
          gmailMessageId: headers['message-id'] || msg.id,
          threadId: fullMessage.threadId,
          subject: headers.subject || '(No Subject)',
          fromEmail: fromEmail,
          fromName: fromName,
          to: Array.isArray(headers.to) ? headers.to : (headers.to ? [headers.to] : []),
          cc: Array.isArray(headers.cc) ? headers.cc : (headers.cc ? [headers.cc] : []),
          date: headers.date ? new Date(headers.date) : new Date(),
          snippet: fullMessage.snippet || '',
          bodyText: body.text || '',
          bodyHtml: body.html || '',
          hasAttachments: hasAttachments(fullMessage.payload),
          labels: fullMessage.labelIds || [],
          labelIds: fullMessage.labelIds || [],
          workspaceMode: 'personal', // Mark as personal email
        };

        await Email.create(emailData);
        syncedCount++;
      } catch (err) {
        console.error(`Error processing message ${msg.id}:`, err.message);
        // Continue with next message
      }
    }

    // Update sync state
    syncState.lastSyncedAt = new Date();
    syncState.syncedCount = (syncState.syncedCount || 0) + syncedCount;
    syncState.totalMessages = resultSizeEstimate;
    syncState.pageToken = nextPageToken;
    await syncState.save();

    res.status(200).json({
      message: `Synced ${syncedCount} emails`,
      syncedCount,
      totalMessages: resultSizeEstimate,
      hasMore: !!nextPageToken,
    });
  } catch (err) {
    console.error('Error syncing personal emails:', err.message);
    res.status(500).json({ error: 'Failed to sync emails', details: err.message });
  }
};

/**
 * GET /api/personal/emails
 * List personal emails with pagination and filters
 * Query: { page, limit, search, label }
 */
exports.listEmails = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const label = req.query.label || '';

    const query = {
      ownerUserId: userId,
      workspaceMode: 'personal',
    };

    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { fromEmail: { $regex: search, $options: 'i' } },
        { fromName: { $regex: search, $options: 'i' } },
        { snippet: { $regex: search, $options: 'i' } },
      ];
    }

    if (label) {
      query.labels = label;
    }

    const skip = (page - 1) * limit;
    const emails = await Email.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select('-bodyText -bodyHtml'); // Exclude full body for list view

    const total = await Email.countDocuments(query);

    res.status(200).json({
      emails,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error listing personal emails:', err.message);
    res.status(500).json({ error: 'Failed to list emails', details: err.message });
  }
};

/**
 * GET /api/personal/emails/:id
 * Get email details by ID
 */
exports.getEmailDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const emailId = req.params.id;

    const email = await Email.findOne({
      _id: emailId,
      ownerUserId: userId,
      workspaceMode: 'personal',
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.status(200).json(email);
  } catch (err) {
    console.error('Error getting email details:', err.message);
    res.status(500).json({ error: 'Failed to get email details', details: err.message });
  }
};

/**
 * POST /api/personal/emails/:id/summarize
 * Generate AI summary for personal email
 */
exports.summarizeEmail = async (req, res) => {
  try {
    const userId = req.user._id;
    const emailId = req.params.id;

    const email = await Email.findOne({
      _id: emailId,
      ownerUserId: userId,
      workspaceMode: 'personal',
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Check if summary already exists
    if (email.aiSummary) {
      return res.status(200).json({
        summary: email.aiSummary,
        category: email.aiCategory,
        importance: email.aiImportance,
      });
    }

    // Generate summary using OpenAI
    const prompt = `Analyze this email and provide:
1. A short summary (3-5 bullet points)
2. Category (Work, Bills, Social, Promotions, Urgent, Other)
3. Importance score (1-5, where 5 is most important)

Email Subject: ${email.subject}
Email From: ${email.fromEmail || email.fromName || ''}
Email Body: ${email.bodyText || email.snippet || ''}

Return JSON format:
{
  "summary": ["bullet point 1", "bullet point 2", ...],
  "category": "Work|Bills|Social|Promotions|Urgent|Other",
  "importance": 1-5
}`;

    const aiResponse = await getJsonFromText(prompt);
    
    if (!aiResponse || !aiResponse.summary) {
      throw new Error('Failed to generate summary');
    }

    // Update email with AI summary
    email.aiSummary = {
      summary: Array.isArray(aiResponse.summary) ? aiResponse.summary.join('\n') : aiResponse.summary,
      key_points: Array.isArray(aiResponse.summary) ? aiResponse.summary : [aiResponse.summary],
      generatedAt: new Date(),
    };
    email.aiCategory = aiResponse.category || 'Other';
    email.aiImportance = aiResponse.importance || 3;
    await email.save();

    res.status(200).json({
      summary: email.aiSummary,
      category: email.aiCategory,
      importance: email.aiImportance,
    });
  } catch (err) {
    console.error('Error summarizing email:', err.message);
    res.status(500).json({ error: 'Failed to summarize email', details: err.message });
  }
};

