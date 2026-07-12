const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    photo: {
        type: String,
    },
    color: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);