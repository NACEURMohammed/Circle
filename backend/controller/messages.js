const user = require('../models/user');
const message = require('../models/message');
const group = require('../models/group');

exports.getcontacts = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await user.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }else {
            const contacts = user.contacts;
            return res.status(200).json({ contacts });
        }}catch (error) {
        console.error('Error fetching contacts:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.addContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const { contactId } = req.body;
        const user = await user.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }else {
            user.contacts.push(contactId);
            await user.save();
            return res.status(200).json({ message: 'Contact added successfully', data: user });
        }}catch (error) {
        console.error('Error adding contact:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.removeContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const { contactId } = req.body;
        const user = await user.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }else {
            user.contacts.pull(contactId);
            await user.save();
            return res.status(200).json({ message: 'Contact removed successfully', data: user });
        }}catch (error) {
        console.error('Error removing contact:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.getMessages = async (req, res) => {
    try {
        const { userId, contactId } = req.params;
        const messages = await message.find({
            $or: [
                { senderId: userId, receiverId: contactId },
                { senderId: contactId, receiverId: userId }
            ]
        });
        return res.status(200).json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.createMessage = async (req, res) => {
    try {
        const { senderId, receiverId, content } = req.body;
        const newMessage = await message.create({ senderId, receiverId, content });
        return res.status(201).json({ message: 'Message created successfully', data: newMessage });
    } catch (error) {
        console.error('Error creating message:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.removeMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.body;
        const user = await user.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }else {
            user.contacts.pull(messageId);
            await user.save();
            return res.status(200).json({ message: 'Message removed successfully', data: user });
        }}catch (error) {
        console.error('Error removing message:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

exports.getGroups = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await user.findOne({ _id: userId }).populate('groups');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.status(200).json({ groups: user.groups });
    } catch (error) {
        console.error('Error fetching groups:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.createGroup = async (req, res) => {
    try {
        const { name, members } = req.body;
        const newGroup = await group.create({ name, members });
        return res.status(201).json({ message: 'Group created successfully', data: newGroup });
    } catch (error) {
        console.error('Error creating group:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.removeGroup = async (req, res) => {
    try {
        const { groupId } = req.body;
        const groupToRemove = await group.findByIdAndDelete(groupId);
        if (!groupToRemove) {
            return res.status(404).json({ message: 'Group not found' });
        }
        return res.status(200).json({ message: 'Group removed successfully' });
    } catch (error) {
        console.error('Error removing group:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getGroupMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const groupMessages = await message.find({ group: groupId });
        return res.status(200).json({ messages: groupMessages });
    } catch (error) {
        console.error('Error fetching group messages:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.createGroupMessage = async (req, res) => {
    try {
        const { senderId, groupId, content } = req.body;
        const newMessage = await message.create({ senderId, group: groupId, content });
        return res.status(201).json({ message: 'Group message created successfully', data: newMessage });
    } catch (error) {
        console.error('Error creating group message:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.removeGroupMessage = async (req, res) => {
    try {
        const { messageId } = req.body;
        const messageToRemove = await message.findByIdAndDelete(messageId);
        if (!messageToRemove) {
            return res.status(404).json({ message: 'Message not found' });
        }
        return res.status(200).json({ message: 'Message removed successfully' });
    } catch (error) {
        console.error('Error removing message:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.addMemberToGroup = async (req, res) => {
    try {
        const { groupId, memberId } = req.body;
        const groupToUpdate = await group.findById(groupId);
        if (!groupToUpdate) {
            return res.status(404).json({ message: 'Group not found' });
        }else {
            groupToUpdate.members.push(memberId);
            await groupToUpdate.save();
            return res.status(200).json({ message: 'Member added to group successfully', data: groupToUpdate });
        }} catch (error) {
        console.error('Error adding member to group:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.removeMemberFromGroup = async (req, res) => {
    try {
        const { groupId, memberId } = req.body;
        const groupToUpdate = await group.findById(groupId);
        if (!groupToUpdate) {
            return res.status(404).json({ message: 'Group not found' });
        }else {
            groupToUpdate.members.pull(memberId);
            await groupToUpdate.save();
            return res.status(200).json({ message: 'Member removed from group successfully', data: groupToUpdate });
        }
    } catch (error) {
        console.error('Error removing member from group:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.getGroupMembers = async (req, res) => {
    try {
        const { groupId } = req.params;
        const groupData = await group.findById(groupId).populate('members');
        if (!groupData) {
            return res.status(404).json({ message: 'Group not found' });
        }else {
            return res.status(200).json({ members: groupData.members });
        }} catch (error) {
        console.error('Error fetching group members:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


exports.getFiles = async (req, res) => {
    try {
        const { userId, contactId } = req.params;
        const files = await message.find({
            $or: [
                { senderId: userId, receiverId: contactId, file: { $exists: true } },]})
            if (!files) {
                return res.status(404).json({ message: 'No files found' });
            }else {
                return res.status(200).json({ files });
            }
        } catch (error) {
        console.error('Error fetching files:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
