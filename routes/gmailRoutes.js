const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { protect, hrOrAdmin } = require('../middlewares/authMiddleware');
const dbManager = require('../services/dbManager');
const gmailService = require('../services/gmailService');
const Applicant = require('../models/Applicant');

// Global cutoff: ignore emails before Jan 1, 2025 (UTC)
const CUTOFF_DATE = new Date('2025-01-01T00:00:00Z');
const cvDir = path.join(__dirname, '..', 'uploads', 'cv');
if (!fs.existsSync(cvDir)) {
  fs.mkdirSync(cvDir, { recursive: true });
}

// ===== OAuth Routes =====

// 1) Start OAuth flow
router.get('/auth', async (req, res) => {
  try {
    let userId = null;

    // Priority: token from query (from frontend)
    if (req.query.token) {
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET || 'super_secret_kairo_key');
        userId = decoded.user?.id || decoded.id || decoded._id || decoded.userId || null;
      } catch (err) {
        console.error('Invalid JWT in /gmail/auth:', err.message);
      }
    }

    // Fallback: Authorization header
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_kairo_key');
        userId = decoded.user?.id || decoded.id || decoded._id || decoded.userId || null;
      } catch (err) {
        console.error('Invalid header JWT in /gmail/auth:', err.message);
      }
    }

    if (!userId) {
      return res.status(401).send('User not authenticated');
    }

    const oAuth2Client = gmailService.createOAuth2Client();

    // Support redirect param in state
    const stateObj = {
      userId: String(userId),
      redirect: req.query.redirect || null,
    };

    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      state: JSON.stringify(stateObj),
    });

    res.redirect(url);
  } catch (err) {
    console.error('Gmail /auth error:', err);
    res.status(500).send(err.message || 'Failed to start Google OAuth');
  }
});

// Callback handler (shared logic)
const handleOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    let userId;
    let redirectPath = '/hr/inbox';

    try {
      // Try parsing state as JSON
      const parsedState = JSON.parse(state);
      userId = parsedState.userId;
      if (parsedState.redirect === 'personal') {
        redirectPath = '/personal/inbox';
      }
    } catch (e) {
      // Fallback: state is just userId
      userId = state;
    }

    const oAuth2Client = gmailService.createOAuth2Client();

    const { tokens } = await oAuth2Client.getToken(code);
    await gmailService.saveGmailTokens(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const redirectUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${redirectUrl}${redirectPath}?gmail=connected`);
  } catch (err) {
    console.error('Gmail callback error:', err);
    res.status(500).send('Failed to complete Google OAuth');
  }
};

// 2) OAuth callback (primary)
router.get('/oauth2/callback', handleOAuthCallback);

// 2b) OAuth callback fallback (Google may redirect to /callback)
router.get('/callback', handleOAuthCallback)

// ===== Authenticated Routes =====

// 3) Get Gmail profile
router.get('/profile', protect, async (req, res) => {
  try {
    const oAuth2Client = await gmailService.getOAuth2ClientForUser(req.user.id);

    const oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: 'v2',
    });

    const { data } = await oauth2.userinfo.get();

    // Get Gmail profile for messagesTotal
    const gmail = await gmailService.getGmailClientForUser(req.user.id);
    let messagesTotal = null;
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      messagesTotal = profile?.data?.messagesTotal ?? null;
    } catch (e) {
      console.warn('Failed to get Gmail profile messagesTotal:', e.message);
    }

    res.json({
      email: data.email || '',
      name: data.name || data.given_name || 'Gmail User',
      picture: data.picture || 'https://ui-avatars.com/api/?name=GM&background=4285f4&color=fff&size=120',
      messagesTotal,
    });
  } catch (err) {
    console.error('Gmail profile error:', err);
    res.status(500).json({ message: 'Failed to fetch Gmail profile' });
  }
});

// 4) Get sync state
router.get('/sync/state', protect, async (req, res) => {
  const scope = (req.query.scope || 'inbox').toString();
  const state = await dbManager.getSyncState(req.user.id, scope);
  res.json(state || {});
});

// 5) Reset sync state
router.post('/sync/reset', protect, async (req, res) => {
  try {
    const scope = (req.query.scope || req.body?.scope || 'inbox').toString();
    const labelIds = req.body?.labelIds || ['INBOX'];

    // Delete SyncState
    await dbManager.resetSyncState(req.user.id, scope);

    // Delete old emails (before 2025) for this scope
    const query = {
      userId: req.user.id,
      labels: { $in: labelIds },
      date: { $lt: CUTOFF_DATE },
    };
    const deletedCount = await dbManager.deleteEmails(query);

    res.json({
      message: 'Sync state reset',
      deletedOldEmails: deletedCount,
      scope,
      readyForNewSync: true,
    });
  } catch (err) {
    console.error('Sync reset error:', err);
    res.status(500).json({ message: 'Failed to reset sync state' });
  }
});

// 6) Paginated sync: fetch one page, store locally
router.post('/sync-page', protect, async (req, res) => {
  try {
    const { limit = 100, pageToken, labelIds, q, scope, startDate, endDate } = req.body;
    const gmail = await gmailService.getGmailClientForUser(req.user.id);

    const max = Math.min(Number(limit), 100);

    // Build Gmail query string for date filtering
    let queryString = q || '';
    if (startDate) {
      const afterDate = new Date(startDate);
      const formattedDate = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;
      queryString += (queryString ? ' ' : '') + `after:${formattedDate}`;
    }
    if (endDate) {
      const beforeDate = new Date(endDate);
      const formattedDate = `${beforeDate.getFullYear()}/${String(beforeDate.getMonth() + 1).padStart(2, '0')}/${String(beforeDate.getDate()).padStart(2, '0')}`;
      queryString += (queryString ? ' ' : '') + `before:${formattedDate}`;
    }

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: max,
      labelIds: Array.isArray(labelIds) && labelIds.length ? labelIds : ['INBOX'],
      includeSpamTrash: false,
      pageToken: pageToken || undefined,
      q: queryString || undefined,
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    let synced = 0;
    let skipped = 0;

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = full.data.payload.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
        const fromHeader = headers.find((h) => h.name === 'From')?.value || '(unknown)';
        const dateHeader = headers.find((h) => h.name === 'Date')?.value || '';
        const toHeader = headers.find((h) => h.name === 'To')?.value || '';
        const ccHeader = headers.find((h) => h.name === 'Cc')?.value || '';

        // Extract email from "Name <email@domain.com>" format
        const fromEmailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
        const fromEmail = fromEmailMatch[1] || fromHeader;
        const fromName = fromHeader.replace(/<[^>]+>/, '').trim();

        const to = toHeader
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);
        const cc = ccHeader
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);

        const { html, text } = gmailService.extractMessageBody(full.data.payload);
        const { hasAttachments, attachments } = gmailService.extractAttachments(full.data.payload);
        const snippet = full.data.snippet || '';
        const labels = full.data.labelIds || [];

        // Enforce cutoff date (2025+ only)
        const emailDate = dateHeader ? new Date(dateHeader) : new Date();
        if (emailDate < CUTOFF_DATE) {
          continue; // Ignore pre-2025 emails
        }

        // Extract Gmail metadata
        const isStarred = labels.includes('STARRED');
        const isImportant = labels.includes('IMPORTANT');
        const isUnread = labels.includes('UNREAD');
        const gmailCategory = gmailService.getGmailCategory(labels);
        const gmailPriority = gmailService.calculateGmailPriority(
          labels,
          isStarred,
          isImportant,
          isUnread,
          emailDate,
          gmailCategory,
          hasAttachments
        );
        const gmailImportance = gmailService.getGmailImportance(isStarred, isImportant, gmailCategory);

        // Detect CV emails
        const isCV = gmailService.detectCV(subject, snippet, text, hasAttachments);

        // Check for duplicates
        const existing = await dbManager.findEmailByGmailId(req.user.id, msg.id);
        if (existing) {
          skipped++;
          continue;
        }

        // Save email
        await dbManager.createEmail({
          userId: req.user.id,
          gmailId: msg.id,
          gmailMessageId: full.data.id,
          threadId: full.data.threadId,
          fromEmail,
          fromName,
          to,
          cc,
          subject,
          snippet,
          bodyText: text,
          bodyHtml: html,
          date: emailDate,
          internalDate: full.data.internalDate,
          hasAttachments,
          attachments,
          labels,
          tags: isCV ? ['CV'] : [],
          isCV,
          gmailImportance,
          gmailCategory,
          gmailPriority,
          isStarred,
          isImportant,
          isUnread,
        });

        synced++;
      } catch (msgError) {
        console.error(`Failed to sync message ${msg.id}:`, msgError.message);
      }
    }

    // Update sync state
    const stateScope = (scope || 'inbox').toString();
    const currentState = await dbManager.getSyncState(req.user.id, stateScope);

    await dbManager.updateSyncState(req.user.id, stateScope, {
      lastPageToken: nextPageToken,
      totalSynced: (currentState?.totalSynced || 0) + synced,
      totalSkipped: (currentState?.totalSkipped || 0) + skipped,
      pagesProcessed: (currentState?.pagesProcessed || 0) + 1,
      lastSyncedAt: new Date(),
      syncedCount: (currentState?.syncedCount || 0) + synced,
    });

    res.json({
      message: 'Page synced',
      synced,
      skipped,
      total: messages.length,
      nextPageToken,
    });
  } catch (err) {
    console.error('Gmail sync-page error:', err);
    const authError = err?.code === 401 || err?.response?.status === 401;
    const friendlyMessage = authError ? 'Gmail connection expired, please reconnect' : err?.message || 'Failed to sync Gmail page';
    res.status(authError ? 401 : 500).json({ message: friendlyMessage });
  }
});

// 7) Local search
router.get('/local/search', protect, async (req, res) => {
  try {
    const { from, keyword, hasAttachments, startDate, endDate, tag, labelId, labelIds, limit = 20, skip = 0 } = req.query;

    const query = { userId: req.user.id };

    if (from) {
      query.fromEmail = new RegExp(from, 'i');
    }

    if (keyword) {
      query.$or = [
        { subject: new RegExp(keyword, 'i') },
        { bodyText: new RegExp(keyword, 'i') },
        { snippet: new RegExp(keyword, 'i') },
      ];
    }

    if (hasAttachments === 'true') {
      query.hasAttachments = true;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (tag) {
      query.tags = tag;
    }

    const labelsFilter = (typeof labelId === 'string' && labelId.trim() ? [labelId.trim()] : []).concat(
      typeof labelIds === 'string'
        ? labelIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        : []
    );
    if (labelsFilter.length) {
      query.labels = { $in: labelsFilter };
    }

    const totalCount = await dbManager.countEmails(query);

    // Sort by internalDate desc (Gmail accurate time), then date desc, then _id for stability
    const sort = { internalDate: -1, date: -1, _id: -1 };

    // FETCH DB SORTED & PAGINATED directly
    // This fixes the issue where latest emails might be missed or misordered by in-memory sort of partial data
    const emails = await dbManager.findEmailsPaginated(
      query,
      sort,
      Number(skip),
      Number(limit) // Use backend limit directly
    );

    // No need to re-sort or slice in memory
    const filtered = emails;

    res.json({ emails: filtered, count: totalCount });
  } catch (err) {
    console.error('Gmail local/search error:', err);
    res.status(500).json({ message: 'Failed to search local emails' });
  }
});

// 8) Filter CVs
router.post('/filter-cvs', protect, hrOrAdmin, async (req, res) => {
  try {
    const { requirements, keywords = [], limit: limitBody } = req.body;

    if (!requirements || !requirements.trim()) {
      return res.status(400).json({ message: 'Job requirements are required' });
    }

    const gmail = await gmailService.getGmailClientForUser(req.user.id);
    const limit = Number(limitBody || 50);

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      labelIds: ['INBOX'],
      includeSpamTrash: false,
      q: '',
    });

    const messages = listRes.data.messages || [];
    const results = [];

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
        });

        const headers = full.data.payload.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
        const from = headers.find((h) => h.name === 'From')?.value || '(unknown)';
        const date = headers.find((h) => h.name === 'Date')?.value || '(no date)';
        const snippet = full.data.snippet || '';

        const { html, text } = gmailService.extractMessageBody(full.data.payload);
        const bodyString = `${subject}\n${snippet}\n${html}\n${text}`.trim();

        const kw = keywords
          .map((k) => k.toLowerCase().trim())
          .filter(Boolean);

        const combinedLower = bodyString.toLowerCase();
        const passKeywords = kw.length === 0 || kw.some((k) => combinedLower.includes(k));

        if (!passKeywords) continue;

        const scoring = await gmailService.scoreEmail({ text: bodyString, requirements });

        results.push({
          id: msg.id,
          from,
          subject,
          date,
          snippet,
          candidateName: scoring.candidateName,
          position: scoring.position,
          score: scoring.score,
          decision: scoring.decision,
          gmailLink: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        });
      } catch (msgError) {
        console.error(`Failed to process message ${msg.id}:`, msgError.message);
      }
    }

    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    res.json(results);
  } catch (err) {
    console.error('Gmail filter-cvs error:', err);
    res.status(500).json({ message: 'Failed to filter CV emails' });
  }
});

// 9) Fetch first PDF attachment from Gmail and attach to applicant CV
router.post('/emails/:id/attach-cv', protect, hrOrAdmin, async (req, res) => {
  try {
    const emailId = req.params.id;
    const applicantId = req.body?.applicantId || req.query?.applicantId;
    if (!applicantId) {
      return res.status(400).json({ message: 'applicantId is required' });
    }

    const email = await dbManager.getEmailById(emailId);
    if (!email || email.userId.toString() !== req.user.id.toString()) {
      return res.status(404).json({ message: 'Email not found' });
    }

    if (!email.hasAttachments || !email.attachments || email.attachments.length === 0) {
      return res.status(404).json({ message: 'No attachments found on this email', skipReason: 'noAttachment' });
    }

    // Find PDF attachments with flexible mimeType detection
    const pdfAttachments = email.attachments.filter((a) => {
      const name = (a.filename || '').toLowerCase();
      const mime = (a.mimeType || '').toLowerCase();
      // Accept .pdf extension OR pdf-related mimeType
      return name.endsWith('.pdf') || mime.includes('pdf');
    });

    if (pdfAttachments.length === 0) {
      return res.status(404).json({ message: 'No PDF attachments found on this email', skipReason: 'noPdf' });
    }

    // Pick best PDF using scoring (prefer PDF with CV-like filename/content)
    let selectedPdf = pdfAttachments[0];
    if (pdfAttachments.length > 1) {
      selectedPdf = gmailService.pickBestPdfAttachment(
        email.attachments,
        email.subject,
        email.snippet,
        email.bodyText || ''
      );
      if (!selectedPdf) {
        selectedPdf = pdfAttachments[0]; // Fallback to first PDF
      }
    }

    const buffer = await gmailService.getAttachmentForUser(req.user.id, email.gmailId, selectedPdf.attachmentId);

    // Check minimum size (to avoid corrupted or placeholder PDFs)
    if (buffer.length < 1024) { // Less than 1KB
      return res.status(400).json({ message: 'PDF is too small (possibly corrupted)', skipReason: 'invalidPdf' });
    }

    const safeBase = (selectedPdf.filename || 'cv.pdf').replace(/[^a-z0-9_.-]/gi, '_');
    const finalName = `${Date.now()}-${safeBase.toLowerCase().endsWith('.pdf') ? safeBase : `${safeBase}.pdf`}`;
    const filePath = path.join(cvDir, finalName);
    fs.writeFileSync(filePath, buffer);

    const baseUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/uploads/cv/${finalName}`;

    const cv = {
      filename: finalName,
      originalName: selectedPdf.filename || 'cv.pdf',
      mimeType: 'application/pdf',
      size: buffer.length,
      url,
      uploadedAt: new Date(),
    };

    const updated = await Applicant.findByIdAndUpdate(applicantId, { cv }, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Applicant not found' });
    }

    res.json({ message: 'CV attached from Gmail', applicant: updated, cv });
  } catch (err) {
    console.error('attach-cv error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to attach CV from Gmail', skipReason: 'error' });
  }
});

// 10) Mark email as converted (update conversionStatus and applicantId)
router.patch('/emails/:id/mark-converted', protect, hrOrAdmin, async (req, res) => {
  try {
    const emailId = req.params.id;
    const { applicantId } = req.body;

    if (!applicantId) {
      return res.status(400).json({ message: 'applicantId is required' });
    }

    const email = await dbManager.getEmailById(emailId);
    if (!email || email.userId.toString() !== req.user.id.toString()) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const updated = await dbManager.updateEmail(emailId, {
      conversionStatus: 'converted',
      applicantId,
      conversionMarkedAt: new Date(),
    });

    res.json({ message: 'Email marked as converted', email: updated });
  } catch (err) {
    console.error('mark-converted error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to mark email as converted' });
  }
});

module.exports = router;
