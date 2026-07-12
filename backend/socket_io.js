const message = require('../models/message');
const socketHandler = (io) => {
    io.on('connection', (socket) => {
        console.log('A user connected', socket.id);
        socket.on('sendMessage', async (data) => {
            try {
                const { owner, content, receiver, file, group } = data;
                const newMessage = new message({ owner, content, receiver, file, group });
                await newMessage.save();
                io.emit('receiveMessage', newMessage);
            } catch (error) {
                console.error('Error sending message:', error);
            }
        });

    });
};

module.exports = socketHandler;