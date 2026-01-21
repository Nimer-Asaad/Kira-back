const Message = require("../models/Message");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Trainee = require("../models/Trainee");

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, receiverModel, content } = req.body;

    if (!receiverId || !receiverModel || !content) {
      return res.status(400).json({ message: "Receiver ID, model, and content are required" });
    }

    // Validate receiver exists
    let receiver;
    if (receiverModel === "User") {
      receiver = await User.findById(receiverId);
    } else if (receiverModel === "Admin") {
      receiver = await Admin.findById(receiverId);
    } else if (receiverModel === "Trainee") {
      receiver = await Trainee.findById(receiverId);
    }

    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    const message = await Message.create({
      sender: req.user._id,
      senderModel: req.user.role === "admin" ? "Admin" : "User",
      receiver: receiverId,
      receiverModel,
      content: content.trim(),
    });

    // Populate sender and receiver details
    await message.populate([
      { path: "sender", select: "fullName email avatar role" },
      { path: "receiver", select: "fullName email avatar role" },
    ]);

    res.status(201).json({ message: "Message sent", data: message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get conversation between two users
exports.getConversation = async (req, res) => {
  try {
    const { userId, userModel } = req.params;

    if (!userId || !userModel) {
      return res.status(400).json({ message: "User ID and model are required" });
    }

    const currentUserId = req.user._id;
    const currentUserModel = req.user.role === "admin" ? "Admin" : req.user.role === "trainee" ? "Trainee" : "User";

    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    })
      .populate("sender", "fullName email avatar role")
      .populate("receiver", "fullName email avatar role")
      .sort({ createdAt: 1 });

    // Mark messages from the other user as read
    await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({ messages });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all conversations for current user
exports.getConversations = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get all messages involving current user
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    })
      .populate("sender", "fullName email avatar role")
      .populate("receiver", "fullName email avatar role")
      .sort({ createdAt: -1 });

    // Group by conversation partner
    const conversationsMap = new Map();

    messages.forEach((msg) => {
      // Skip messages where sender or receiver is null (deleted users)
      if (!msg.sender || !msg.receiver) {
        return;
      }

      const isReceiver = msg.receiver._id.toString() === currentUserId.toString();
      const partner = isReceiver ? msg.sender : msg.receiver;
      
      // Double check partner exists
      if (!partner || !partner._id) {
        return;
      }
      
      const partnerId = partner._id.toString();

      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          user: partner,
          userModel: isReceiver ? msg.senderModel : msg.receiverModel,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      // Count unread messages from partner
      if (isReceiver && !msg.isRead) {
        conversationsMap.get(partnerId).unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values());

    res.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get unread message count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: "Message IDs array is required" });
    }

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        receiver: req.user._id,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Clear chat history with a specific user
exports.clearChat = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Delete all messages between current user and target user
    const result = await Message.deleteMany({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    });

    res.json({
      message: "Chat history cleared successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Clear chat error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get available users to chat with (any role → everyone)
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentId = req.user._id.toString();

    // Fetch all accounts (Admins + Users of all roles)
    const [admins, users] = await Promise.all([
      Admin.find({ _id: { $ne: currentId } }).select("fullName email avatar"),
      User.find({ _id: { $ne: currentId } }).select("fullName email role avatar"),
    ]);

    const normalizedAdmins = admins.map((a) => ({
      _id: a._id,
      fullName: a.fullName,
      email: a.email,
      role: "admin",
      avatar: a.avatar,
      userModel: "Admin",
    }));

    const normalizedUsers = users.map((u) => ({
      _id: u._id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      avatar: u.avatar,
      userModel: "User",
    }));

    const all = [...normalizedAdmins, ...normalizedUsers];

    res.json({ users: all });
  } catch (error) {
    console.error("Get available users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
