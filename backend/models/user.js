const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    photo: {
        type: String,
    },
    email: { 
        type: String, 
        required: true,
        unique: true
    },
    password: { 
        type: String, 
        required: true
    },
    contacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    verified: {
        type: Boolean,
        default: false
    },
    verifyToken: {
        type: String,
        default: null
    },
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'message'
    }],
    groups: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group'
    }],
    googleId: {
        type: String,
        default: null
    },
    facebookId: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);