const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');

const User = require('../models/user');
const Message = require('../models/message');
const Group = require('../models/group');
const { authenticate } = require('../controller/auth');
const { syncMutualContacts, removeMutualContacts } = require('../utils/contacts');

const router = express.Router();

/* ─── Multer (file uploads) ─── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

/* ═══════════════════════════════════════════
   CONTACTS
═══════════════════════════════════════════ */

// GET /api/messages/contacts — list current user's contacts
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).populate('contacts', 'name email photo');
    if (!me) return res.status(404).json({ message: 'User not found' });

    const contacts = (me.contacts || []).map((c) => ({
      id: c._id,
      name: c.name,
      email: c.email,
      photo: c.photo
    }));

    res.json({ contacts });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/users/search?q=... — search users by name or email
router.get('/users/search', authenticate, async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    if (!query) return res.json({ users: [] });

    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const results = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).limit(15);

    const mapped = results.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      photo: u.photo,
      isContact: (me.contacts || []).includes(u._id.toString())
    }));

    res.json({ users: mapped });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/contacts — add a contact by userId or email
router.post('/contacts', authenticate, async (req, res) => {
  try {
    const { contactId, email } = req.body;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    let contact;
    if (contactId) {
      contact = await User.findById(contactId);
    } else if (email) {
      contact = await User.findOne({ email: email.toLowerCase() });
    }

    if (!contact) return res.status(404).json({ message: 'User not found' });
    if (contact._id.toString() === me._id.toString()) {
      return res.status(400).json({ message: 'You cannot add yourself' });
    }

    if (!me.contacts) me.contacts = [];
    if ((me.contacts || []).some((id) => id.toString() === contact._id.toString())) {
      return res.status(400).json({ message: 'Already a contact' });
    }

    syncMutualContacts(me, contact);
    await Promise.all([me.save(), contact.save()]);

    res.json({
      message: 'Contact added',
      contact: { id: contact._id, name: contact.name, email: contact.email }
    });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/contacts/:contactId — remove a contact
router.delete('/contacts/:contactId', authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const otherUser = await User.findById(req.params.contactId);
    if (otherUser) {
      removeMutualContacts(me, otherUser);
      await Promise.all([me.save(), otherUser.save()]);
    } else {
      me.contacts = (me.contacts || []).filter((id) => id.toString() !== req.params.contactId);
      await me.save();
    }
    res.json({ message: 'Contact removed' });
  } catch (err) {
    console.error('Remove contact error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ═══════════════════════════════════════════
   CONVERSATIONS
═══════════════════════════════════════════ */

// GET /api/messages/conversations — all conversations for current user
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).populate('contacts', 'name email photo');
    if (!me) return res.status(404).json({ message: 'User not found' });

    const myId = new mongoose.Types.ObjectId(req.user.id);

    // Direct conversations: for each contact, load the latest messages
    const directConversations = await Promise.all(
      (me.contacts || []).map(async (contact) => {
        const contactId = contact._id;

        const rawMsgs = await Message.find({
          $or: [
            { owner: myId, receiver: contactId },
            { owner: contactId, receiver: myId }
          ]
        })
          .sort({ createdAt: -1 })
          .limit(10);

        const convMsgs = rawMsgs.reverse().map((m) => ({
          id: m._id,
          senderId: m.owner,
          receiverId: m.receiver,
          content: m.content,
          fileUrl: m.file,
          fileName: m.fileName,
          fileType: m.fileType,
          createdAt: m.createdAt
        }));

        return {
          id: `d:${contactId}`,
          type: 'direct',
          name: contact.name,
          contact: contactId,
          time: convMsgs.length ? convMsgs[convMsgs.length - 1].createdAt : null,
          unread: 0,
          messages: convMsgs
        };
      })
    );

    // Group conversations: load all groups where current user is a member
    const myGroups = await Group.find({ members: myId });
    const groupConversations = await Promise.all(
      myGroups.map(async (group) => {
        const rawMsgs = await Message.find({ group: group._id })
          .sort({ createdAt: -1 })
          .limit(10);

        const grpMsgs = rawMsgs.reverse().map((m) => ({
          id: m._id,
          senderId: m.owner,
          groupId: m.group,
          content: m.content,
          fileUrl: m.file,
          fileName: m.fileName,
          fileType: m.fileType,
          createdAt: m.createdAt
        }));

        return {
          id: `g:${group._id}`,
          type: 'group',
          name: group.name,
          members: group.members,
          color: group.color || 0,
          time: grpMsgs.length ? grpMsgs[grpMsgs.length - 1].createdAt : null,
          unread: 0,
          messages: grpMsgs
        };
      })
    );

    res.json({ conversations: [...directConversations, ...groupConversations] });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/conversations/:convId — delete a chat
router.delete('/conversations/:convId', authenticate, async (req, res) => {
  try {
    const convId = req.params.convId;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    if (convId.startsWith('d:')) {
      const contactId = convId.replace('d:', '');
      // Remove contact relation
      me.contacts = (me.contacts || []).filter((id) => id.toString() !== contactId);
      await me.save();

      // Delete all messages between user and contact
      await Message.deleteMany({
        $or: [
          { owner: req.user.id, receiver: contactId },
          { owner: contactId, receiver: req.user.id }
        ]
      });
    } else if (convId.startsWith('g:')) {
      const groupId = convId.replace('g:', '');
      const group = await Group.findById(groupId);
      if (group) {
        // Remove user from group members
        group.members = (group.members || []).filter((id) => id.toString() !== req.user.id);
        if (group.members.length === 0) {
          // If no members left, delete the group and group messages
          await Group.findByIdAndDelete(groupId);
          await Message.deleteMany({ group: groupId });
        } else {
          await group.save();
        }
      }
    }

    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ═══════════════════════════════════════════
   MESSAGES
═══════════════════════════════════════════ */

// GET /api/messages/messages/:convId — load messages for a single conversation
router.get('/messages/:convId', authenticate, async (req, res) => {
  try {
    const convId = req.params.convId;
    const myId = new mongoose.Types.ObjectId(req.user.id);

    let rawMsgs;
    if (convId.startsWith('d:')) {
      const contactId = new mongoose.Types.ObjectId(convId.replace('d:', ''));
      rawMsgs = await Message.find({
        $or: [
          { owner: myId, receiver: contactId },
          { owner: contactId, receiver: myId }
        ]
      }).sort({ createdAt: 1 });
    } else {
      const groupId = new mongoose.Types.ObjectId(convId.replace('g:', ''));
      rawMsgs = await Message.find({ group: groupId }).sort({ createdAt: 1 });
    }

    const mapped = rawMsgs.map((m) => ({
      id: m._id,
      senderId: m.owner,
      receiverId: m.receiver,
      groupId: m.group,
      content: m.content,
      fileUrl: m.file,
      fileName: m.fileName,
      fileType: m.fileType,
      createdAt: m.createdAt
    }));

    res.json({ messages: mapped });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/messages — send a direct message
router.post('/messages', authenticate, async (req, res) => {
  try {
    const { receiverId, content, fileUrl, fileName, fileType } = req.body;
    const msg = new Message({
      owner: req.user.id,
      receiver: receiverId,
      content: content || '',
      file: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null
    });
    await msg.save();

    res.status(201).json({
      message: {
        id: msg._id,
        senderId: msg.owner,
        receiverId: msg.receiver,
        content: msg.content,
        fileUrl: msg.file,
        fileName: msg.fileName,
        fileType: msg.fileType,
        createdAt: msg.createdAt
      }
    });
  } catch (err) {
    console.error('Send direct message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/group-messages — send a group message
router.post('/group-messages', authenticate, async (req, res) => {
  try {
    const { groupId, content, fileUrl, fileName, fileType } = req.body;
    const msg = new Message({
      owner: req.user.id,
      group: groupId,
      content: content || '',
      file: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null
    });
    await msg.save();

    res.status(201).json({
      message: {
        id: msg._id,
        senderId: msg.owner,
        groupId: msg.group,
        content: msg.content,
        fileUrl: msg.file,
        fileName: msg.fileName,
        fileType: msg.fileType,
        createdAt: msg.createdAt
      }
    });
  } catch (err) {
    console.error('Send group message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/messages/:messageId — delete a single message
router.delete('/messages/:messageId', authenticate, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await Message.findByIdAndDelete(req.params.messageId);
    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ═══════════════════════════════════════════
   GROUPS
═══════════════════════════════════════════ */

// POST /api/messages/groups — create a group
router.post('/groups', authenticate, async (req, res) => {
  try {
    const { name, members, color } = req.body;
    const group = new Group({
      name,
      members: members || [],
      color: color || 0
    });
    await group.save();

    res.status(201).json({
      group: {
        id: group._id,
        name: group.name,
        members: group.members,
        color: group.color
      }
    });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ═══════════════════════════════════════════
   FILE UPLOAD
═══════════════════════════════════════════ */

// POST /api/messages/upload — upload a file
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    fileUrl,
    fileName: req.file.originalname,
    fileType: req.file.mimetype,
    size: req.file.size
  });
});

module.exports = router;