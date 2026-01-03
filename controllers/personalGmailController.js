const { google } = require("googleapis");
const PersonalEmail = require("../models/PersonalEmail");
const GmailConnection = require("../models/GmailConnection");
const gmailService = require("../services/gmailService");
const { getJsonFromText } = require("../services/openaiClient");

// Helper: Save tokens to GmailConnection (similar to HR's saveGmailTokens)
const savePersonalGmailTokens = async (userId, tokens) => {
  // Get user email from tokens first
  const oAuth2Client = gmailService.createOAuth2Client();
  oAuth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: oAuth2Client, version: "v2" });
  const { data } = await oauth2.userinfo.get();

  await GmailConnection.findOneAndUpdate(
    { ownerUserId: userId },
    {
      ownerUserId: userId,
      provider: "google",
      emailAddress: data.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    },
    { upsert: true, new: true }
  );
};

// Helper: Get OAuth2 client for personal user (similar to HR's getOAuth2ClientForUser)
const getOAuth2ClientForPersonalUser = async (userId) => {
  const connection = await GmailConnection.findOne({ ownerUserId: userId });
  if (!connection || !connection.accessToken || !connection.refreshToken) {
    throw new Error("Gmail not connected");
  }

  const oAuth2Client = gmailService.createOAuth2Client();
  oAuth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry.getTime(),
  });

  // Auto-refresh tokens
  oAuth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await savePersonalGmailTokens(userId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || connection.refreshToken,
        expiry_date: tokens.expiry_date || connection.tokenExpiry.getTime(),
      });
    }
  });

  return oAuth2Client;
};

// Helper: Get Gmail client for personal user
const getGmailClientForPersonalUser = async (userId) => {
  const oAuth2Client = await getOAuth2ClientForPersonalUser(userId);
  return google.gmail({ version: "v1", auth: oAuth2Client });
};

// @desc    Get Gmail connection status
// @route   GET /api/personal/gmail/status
// @access  Private
const getStatus = async (req, res) => {
  try {
    const connection = await GmailConnection.findOne({ ownerUserId: req.user._id });

    if (!connection) {
      return res.json({
        status: "not_connected",
        connected: false,
      });
    }

    res.json({
      status: "connected",
      connected: true,
      emailAddress: connection.emailAddress,
      lastSyncAt: connection.lastSyncAt,
      selectedLabel: connection.selectedLabel,
    });
  } catch (error) {
    console.error("Error getting Gmail status:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Start Gmail OAuth flow (same pattern as HR)
// @route   GET /api/personal/gmail/connect
// @access  Private (or via token in query)
const connectGmail = async (req, res) => {
  try {
    let userId = null;

    // Priority: token from query (from frontend) - same as HR
    if (req.query.token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET || "super_secret_kairo_key");
        userId = decoded.user?.id || decoded.id || decoded._id || decoded.userId || null;
      } catch (err) {
        console.error("Invalid JWT in /personal/gmail/connect:", err.message);
      }
    }

    // Fallback: from authenticated user (protect middleware)
    if (!userId && req.user) {
      userId = req.user._id;
    }

    // Fallback: Authorization header
    if (!userId && req.headers.authorization) {
      try {
        const jwt = require("jsonwebtoken");
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "super_secret_kairo_key");
        userId = decoded.user?.id || decoded.id || decoded._id || decoded.userId || null;
      } catch (err) {
        console.error("Invalid header JWT in /personal/gmail/connect:", err.message);
      }
    }

    if (!userId) {
      return res.status(401).send("User not authenticated");
    }

    const oAuth2Client = gmailService.createOAuth2Client();

    // Ensure redirect URI matches what's configured in Google Console
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    console.log("OAuth redirect URI:", redirectUri);
    console.log("User ID for OAuth state:", userId);

    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // Force consent to get refresh token
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      state: String(userId),
    });

    console.log("Generated OAuth URL (first 100 chars):", url.substring(0, 100));

    // For POST requests, return JSON with authUrl
    // For GET requests, redirect directly (legacy support)
    if (req.method === "POST") {
      res.json({ authUrl: url });
    } else {
      res.redirect(url);
    }
  } catch (error) {
    console.error("Error starting Gmail OAuth:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Handle Gmail OAuth callback (same as HR)
// @route   GET /api/personal/gmail/callback
// @access  Public (called by Google)
const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    const userId = state;
    const oAuth2Client = gmailService.createOAuth2Client();

    const { tokens } = await oAuth2Client.getToken(code);
    
    // Save tokens using same pattern as HR
    await savePersonalGmailTokens(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${redirectUrl}/personal/inbox?gmail=connected`);
  } catch (err) {
    console.error("Gmail callback error:", err);
    const redirectUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${redirectUrl}/personal/inbox?gmail=error`);
  }
};

// @desc    Disconnect Gmail
// @route   POST /api/personal/gmail/disconnect
// @access  Private
const disconnectGmail = async (req, res) => {
  try {
    await GmailConnection.findOneAndDelete({ ownerUserId: req.user._id });
    res.json({ message: "Gmail disconnected successfully" });
  } catch (error) {
    console.error("Error disconnecting Gmail:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Sync emails from Gmail
// @route   POST /api/personal/emails/sync
// @access  Private
const syncEmails = async (req, res) => {
  try {
    const { label = null, maxResults = 20, query = null } = req.body;

    const max = Math.min(Number(maxResults), 100);
    const gmail = await getGmailClientForPersonalUser(req.user._id);

    // Build Gmail query
    let gmailQuery = query || "";
    if (label) {
      gmailQuery = (gmailQuery ? `${gmailQuery} ` : "") + `label:${label}`;
    }

    // Fetch messages
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: max,
      labelIds: label ? [label] : ["INBOX"],
      includeSpamTrash: false,
      q: gmailQuery || undefined,
    });

    const messages = listRes.data.messages || [];
    let syncedCount = 0;
    let skippedCount = 0;

    // Process each message
    for (const msg of messages) {
      try {
        // Check if already exists
        const existing = await PersonalEmail.findOne({
          ownerUserId: req.user._id,
          gmailMessageId: msg.id,
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        // Fetch full message
        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = fullMessage.data.payload?.headers || [];
        const headerMap = {};
        headers.forEach((h) => {
          headerMap[h.name] = h.value;
        });

        // Extract data
        const fromHeader = headerMap["From"] || "";
        const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/) || [null, fromHeader, fromHeader];
        const fromName = fromMatch[1]?.trim() || "";
        const fromEmail = fromMatch[2]?.trim() || fromHeader;

        const subject = headerMap["Subject"] || "(no subject)";
        const dateHeader = headerMap["Date"];
        const receivedAt = dateHeader ? new Date(dateHeader) : new Date(fullMessage.data.internalDate);

        // Extract body
        const { html, text } = gmailService.extractMessageBody(fullMessage.data.payload);
        const snippet = fullMessage.data.snippet || "";
        const labels = fullMessage.data.labelIds || [];

        // Truncate bodyText for safety (12k chars)
        const bodyText = (text || "").substring(0, 12000);
        const bodyHtml = html || null;

        // Create email
        await PersonalEmail.create({
          ownerUserId: req.user._id,
          gmailMessageId: msg.id,
          threadId: fullMessage.data.threadId || "",
          fromName,
          fromEmail,
          subject,
          snippet,
          bodyText,
          bodyHtml,
          receivedAt,
          labels,
          isRead: labels.includes("UNREAD") ? false : true,
        });

        syncedCount++;
      } catch (msgError) {
        console.error(`Error processing message ${msg.id}:`, msgError.message);
        skippedCount++;
      }
    }

    // Update connection lastSyncAt
    await GmailConnection.findOneAndUpdate(
      { ownerUserId: req.user._id },
      { lastSyncAt: new Date() }
    );

    const totalStored = await PersonalEmail.countDocuments({ ownerUserId: req.user._id });

    res.json({
      syncedCount,
      skippedCount,
      totalStored,
      lastSyncAt: new Date(),
    });
  } catch (error) {
    console.error("Error syncing emails:", error);
    if (error.message === "Gmail not connected") {
      return res.status(401).json({ message: "Gmail not connected. Please connect your Gmail account." });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    List personal emails
// @route   GET /api/personal/emails
// @access  Private
const listEmails = async (req, res) => {
  try {
    const {
      search = "",
      category = "",
      importance = "",
      from = "",
      to = "",
      page = 1,
      limit = 20,
    } = req.query;

    const query = { ownerUserId: req.user._id };

    // Search filter
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: "i" } },
        { fromEmail: { $regex: search, $options: "i" } },
        { fromName: { $regex: search, $options: "i" } },
        { snippet: { $regex: search, $options: "i" } },
        { bodyText: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category && category !== "all") {
      query.category = category;
    }

    // Importance filter
    if (importance && importance !== "all") {
      query.importance = parseInt(importance);
    }

    // From email filter
    if (from && !from.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // If not a date format, treat as email filter
      query.fromEmail = { $regex: from, $options: "i" };
    }

    // Date range filter
    if (from && from.match(/^\d{4}-\d{2}-\d{2}$/)) {
      query.receivedAt = { $gte: new Date(from) };
    }
    if (to && to.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (query.receivedAt) {
        query.receivedAt.$lte = toDate;
      } else {
        query.receivedAt = { $lte: toDate };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const emails = await PersonalEmail.find(query)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-bodyText -bodyHtml"); // Exclude full body for list

    const total = await PersonalEmail.countDocuments(query);

    res.json({
      emails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error listing emails:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get email details
// @route   GET /api/personal/emails/:id
// @access  Private
const getEmailDetails = async (req, res) => {
  try {
    const email = await PersonalEmail.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }

    res.json(email);
  } catch (error) {
    console.error("Error getting email details:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete email
// @route   DELETE /api/personal/emails/:id
// @access  Private
const deleteEmail = async (req, res) => {
  try {
    const email = await PersonalEmail.findOneAndDelete({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }

    res.json({ message: "Email deleted successfully" });
  } catch (error) {
    console.error("Error deleting email:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Mark email as read
// @route   POST /api/personal/emails/:id/mark-read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const email = await PersonalEmail.findOneAndUpdate(
      {
        _id: req.params.id,
        ownerUserId: req.user._id,
      },
      { isRead: true },
      { new: true }
    );

    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }

    res.json(email);
  } catch (error) {
    console.error("Error marking email as read:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Generate AI summary for email
// @route   POST /api/personal/emails/:id/summarize
// @access  Private
const summarizeEmail = async (req, res) => {
  try {
    const email = await PersonalEmail.findOne({
      _id: req.params.id,
      ownerUserId: req.user._id,
    });

    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }

    // Truncate bodyText for AI (12k chars)
    const bodyText = (email.bodyText || email.snippet || "").substring(0, 12000);

    const prompt = `Analyze this email and provide a JSON response with:
1. A short summary paragraph (2-3 sentences)
2. 3-5 bullet points of key information
3. Category: one of "Work", "Bills", "Social", "Promotions", "Urgent", "Other"
4. Importance: 1-5 (where 5 is most important)
5. Action items/todos: 0-5 actionable items if any

Email Subject: ${email.subject}
Email From: ${email.fromEmail || email.fromName || ""}
Email Body: ${bodyText}

Return ONLY valid JSON in this exact format:
{
  "summary": "Short paragraph summary",
  "bullets": ["bullet 1", "bullet 2", "bullet 3"],
  "category": "Work|Bills|Social|Promotions|Urgent|Other",
  "importance": 1-5,
  "todo": ["action item 1", "action item 2"]
}`;

    const aiResponse = await getJsonFromText("", prompt);

    if (!aiResponse) {
      throw new Error("Failed to generate summary");
    }

    // Update email with AI data
    email.aiSummary = aiResponse.summary || "";
    email.aiBullets = Array.isArray(aiResponse.bullets) ? aiResponse.bullets : [];
    email.category = aiResponse.category || "Other";
    email.importance = aiResponse.importance || 3;
    email.aiTodo = Array.isArray(aiResponse.todo) ? aiResponse.todo : [];
    email.lastSummarizedAt = new Date();
    await email.save();

    res.json({
      summary: email.aiSummary,
      bullets: email.aiBullets,
      category: email.category,
      importance: email.importance,
      todo: email.aiTodo,
    });
  } catch (error) {
    console.error("Error summarizing email:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getStatus,
  connectGmail,
  handleCallback,
  disconnectGmail,
  syncEmails,
  listEmails,
  getEmailDetails,
  deleteEmail,
  markAsRead,
  summarizeEmail,
};
