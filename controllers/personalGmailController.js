const { google } = require("googleapis");
const Email = require("../models/Email"); // SHARED Email model
const GmailConnection = require("../models/GmailConnection"); // Need this for token storage logic
const gmailService = require("../services/gmailService");
const { getJsonFromText } = require("../services/openaiClient");
const mongoose = require("mongoose");

// Reusing HR controller logic where possible for Parity
const hrController = require("./hrGmailController");

// Helper: Save tokens to GmailConnection (similar to HR's saveGmailTokens)
const savePersonalGmailTokens = async (userId, tokens) => {
  // Get user email from tokens first
  const oAuth2Client = gmailService.createOAuth2Client();
  oAuth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: oAuth2Client, version: "v2" });
  const { data } = await oauth2.userinfo.get();

  console.log("Saving connection for:", userId, data.email);

  await GmailConnection.findOneAndUpdate(
    { ownerUserId: new mongoose.Types.ObjectId(userId) },
    {
      ownerUserId: new mongoose.Types.ObjectId(userId),
      provider: "google",
      emailAddress: data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    },
    { upsert: true, new: true }
  );
};

// @desc    Start Gmail OAuth flow (Specific to Personal Inbox to ensure redirect back to Personal)
// @route   GET /api/personal/gmail/connect
const connectGmail = async (req, res) => {
  try {
    let userId = null;
    if (req.query.token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET || "super_secret_kairo_key");
        userId = decoded.user?.id || decoded.id || decoded._id || decoded.userId || null;
      } catch (err) {
        console.error("Invalid JWT in connect:", err.message);
      }
    }
    if (!userId && req.user) userId = req.user._id;
    if (!userId && req.headers.authorization) {
      // ... (simplified auth extraction if needed, but protect middleware usually handles this)
    }

    if (!userId) return res.status(401).send("User not authenticated");

    const serverUrl = process.env.SERVER_URL || "http://localhost:8000";
    const personalRedirectUri = `${serverUrl}/api/personal/gmail/callback`;
    const oAuth2Client = gmailService.createOAuth2Client(personalRedirectUri);

    const stateObj = { userId: String(userId), type: "personal_inbox" };
    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      state: JSON.stringify(stateObj),
    });

    if (req.method === "POST") res.json({ authUrl: url });
    else res.redirect(url);
  } catch (error) {
    console.error("Error starting OAuth:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Handle Gmail OAuth callback
// @route   GET /api/personal/gmail/callback
const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code or state");

    let userId;
    try {
      const parsedState = JSON.parse(state);
      userId = parsedState.userId;
    } catch (e) {
      userId = state;
    }

    const serverUrl = process.env.SERVER_URL || "http://localhost:8000";
    const personalRedirectUri = `${serverUrl}/api/personal/gmail/callback`;
    const oAuth2Client = gmailService.createOAuth2Client(personalRedirectUri);

    const { tokens } = await oAuth2Client.getToken(code);
    await savePersonalGmailTokens(userId, tokens);

    // Also update HR/Shared User tokens so the generic sync works!
    // This is CRITICAL because we switched to using the Shared Email model and Shared Sync endpoints
    // which rely on User.gmailAccessToken, not GmailConnection!
    const dbManager = require("../services/dbManager");
    await dbManager.updateUser(userId, {
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token,
      gmailTokenExpiry: tokens.expiry_date,
    });

    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${redirectUrl}/personal/inbox?gmail=connected`);
  } catch (err) {
    console.error("Callback error:", err);
    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${redirectUrl}/personal/inbox?gmail=error&message=${encodeURIComponent(err.message)}`);
  }
};

// @desc    Disconnect Gmail
// @route   POST /api/personal/gmail/disconnect
const disconnectGmail = async (req, res) => {
  try {
    await GmailConnection.findOneAndDelete({ ownerUserId: req.user._id });
    // Also clear from User model? Maybe not to avoid breaking HR if they share it. 
    // But "Personal" disconnect usually implies disconnecting the user's integration.
    // For safety, let's strictly follow the request to not break HR. 
    // If HR uses the same tokens, disconnecting here might be ambiguous. 
    // But since we are reusing HR components, we assume the User IS the HR user or equivalent.

    res.json({ message: "Gmail disconnected successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete email (Implementing for Shared Email model)
const deleteEmail = async (req, res) => {
  try {
    const email = await Email.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!email) return res.status(404).json({ message: "Email not found" });
    res.json({ message: "Email deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Mark as Read (Implementing for Shared Email model)
const markAsRead = async (req, res) => {
  try {
    const email = await Email.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!email) return res.status(404).json({ message: "Email not found" });
    res.json(email);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate AI summary (My fixed version)
const summarizeEmail = async (req, res) => {
  try {
    const email = await Email.findOne({ _id: req.params.id, userId: req.user._id });
    if (!email) return res.status(404).json({ message: "Email not found" });

    const bodyText = (email.bodyText || email.bodyHtml || email.snippet || "").substring(0, 12000);
    if (!bodyText || bodyText.trim().length === 0) {
      return res.status(400).json({ error: 'Email body is empty; cannot generate summary' });
    }

    const systemPrompt = `You are a personal assistant. Analyze the following email and provide a structured summary in strict JSON format:
{
  "summary": "Brief summary of the email (max 100 words)",
  "key_points": ["point 1", "point 2", "point 3"],
  "action_items": ["action 1", "action 2"],
  "urgency": "low|medium|high",
  "category": "Work|Personal|Bills|Social|Promotions|Other"
}
Response MUST be valid JSON only.`;

    const emailContent = `From: ${email.fromName || email.fromEmail}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${bodyText}`;
    const summaryResponse = await getJsonFromText(systemPrompt, emailContent);

    let summary;
    try {
      summary = typeof summaryResponse === 'string' ? JSON.parse(summaryResponse) : summaryResponse;
    } catch (parseError) {
      summary = { summary: 'Failed to parse AI response', key_points: [], action_items: [], urgency: 'unknown', category: 'Other' };
    }

    email.aiSummary = { ...summary, generatedAt: new Date() };
    await email.save();

    res.status(200).json({ message: 'AI summary generated', aiSummary: email.aiSummary });
  } catch (error) {
    if (error.message === 'OPENAI_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'OpenAI not configured', message: 'Missing OPENAI_API_KEY' });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Exporting ALL required functions
module.exports = {
  getStatus: hrController.getStatus,         // Reuse HR status logic (checks SyncState)
  connectGmail,                              // Personal: Specific redirect
  handleCallback,                            // Personal: Specific redirect + saves to User for shared sync
  disconnectGmail,                           // Personal
  syncEmails: hrController.syncEmails,       // Reuse HR sync (Shared Email model)
  listEmails: hrController.listEmails,       // Reuse HR list (Shared Email model)
  getEmailDetails: hrController.getEmailDetails, // Reuse HR details (Shared Email model)
  deleteEmail,                               // Implemented for Shared Email
  markAsRead,                                // Implemented for Shared Email
  summarizeEmail,                            // Fixed AI Summary
};
