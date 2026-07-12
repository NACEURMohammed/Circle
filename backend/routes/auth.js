const express = require('express');
const auth = require('../controller/auth');

const router = express.Router();

router.post('/register', auth.registerStrategies);
router.post('/login', auth.loginStrategies);
router.get('/me', auth.getCurrentUser);
router.get('/google', auth.googleStrategy);
router.get('/google/callback', auth.googleCallback);
router.get('/facebook', auth.facebookStrategy);
router.get('/facebook/callback', auth.facebookCallback);
router.get('/verify-email/:token', auth.verifyEmail);

module.exports = router;