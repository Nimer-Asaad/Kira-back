const User = require('../models/User');
const Email = require('../models/Email');
const SyncState = require('../models/SyncState');

class DBManager {
  // User operations
  async findUserById(userId) {
    return await User.findById(userId);
  }

  async updateUser(userId, updates) {
    return await User.findByIdAndUpdate(userId, updates, { new: true });
  }

  // Email operations
  async findEmailByGmailId(userId, gmailId) {
    return await Email.findOne({ userId, gmailId });
  }

  async createEmail(emailData) {
    const email = new Email(emailData);
    return await email.save();
  }

  async findEmails(query) {
    return await Email.find(query).sort({ date: -1 });
  }

  async findEmailsPaginated(query, sort = { internalDate: -1, date: -1, _id: -1 }, skip = 0, limit = 20) {
    return await Email.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  async countEmails(query) {
    return await Email.countDocuments(query);
  }

  async deleteEmails(query) {
    const result = await Email.deleteMany(query);
    return result.deletedCount || 0;
  }

  async updateEmail(emailId, updates) {
    return await Email.findByIdAndUpdate(emailId, updates, { new: true });
  }

  async getEmailById(emailId) {
    return await Email.findById(emailId);
  }

  // SyncState operations
  async getSyncState(userId, scope = 'inbox') {
    return await SyncState.findOne({ userId, scope });
  }

  async updateSyncState(userId, scope = 'inbox', updates) {
    return await SyncState.findOneAndUpdate(
      { userId, scope },
      updates,
      { new: true, upsert: true }
    );
  }

  async resetSyncState(userId, scope = 'inbox') {
    return await SyncState.deleteOne({ userId, scope });
  }

  // Batch operations
  async findCVEmails(userId, limit = 50) {
    return await Email.find({ userId, isCV: true }).limit(limit).sort({ date: -1 });
  }

  async searchEmails(userId, query, limit = 50) {
    return await Email.find({
      userId,
      $or: [
        { subject: new RegExp(query, 'i') },
        { bodyText: new RegExp(query, 'i') },
        { snippet: new RegExp(query, 'i') },
      ],
    })
      .limit(limit)
      .sort({ date: -1 });
  }
}

module.exports = new DBManager();
