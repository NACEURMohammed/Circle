const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        default: ''
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    file: {
        type: String,
    },
    fileName: {
        type: String,
    },
    fileType: {
        type: String,
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
    },
}, { timestamps: true });

module.exports = mongoose.model('message', messageSchema);