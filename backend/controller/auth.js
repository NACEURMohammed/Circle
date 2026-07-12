require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'cercle-fallback-secret';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/* ─── Mailer ─── */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendVerificationEmail(email, name, token) {
  const link = `${BASE_URL}/api/auth/verify-email/${token}`;
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Cercle <no-reply@cercle.com>',
    to: email,
    subject: 'Verify your Cercle account',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#FAF8F5;border-radius:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
          <div style="width:34px;height:34px;border-radius:50%;background:conic-gradient(from 140deg,#C6427E,#E8B647,#C6427E);"></div>
          <span style="font-size:22px;font-weight:700;color:#14162B;">Cercle</span>
        </div>
        <h1 style="font-size:20px;color:#14162B;margin:0 0 10px;">Hey ${name}, confirm your email</h1>
        <p style="color:#6B7089;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Click the button below to verify your email address and activate your Cercle account.
        </p>
        <a href="${link}" style="display:inline-block;background:#C6427E;color:#fff;padding:12px 28px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none;">
          Verify my email →
        </a>
        <p style="color:#9A9DB5;font-size:11.5px;margin-top:28px;">
          If you didn't create a Cercle account, you can safely ignore this email.
        </p>
      </div>
    `
  };

  // Try sending with configured transporter first
  try {
    const info = await transporter.sendMail(mailOptions);
    // If using Ethereal the preview URL is useful
    const preview = info && info.messageId && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
    return { success: true, previewUrl: preview };
  } catch (err) {
    // Fallback to Ethereal for development/testing so user can view the message
    try {
      const testAccount = await nodemailer.createTestAccount();
      const testTransport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
      const info2 = await testTransport.sendMail(mailOptions);
      const preview = nodemailer.getTestMessageUrl(info2);
      return { success: true, previewUrl: preview };
    } catch (err2) {
      throw err2 || err;
    }
  }
}

/* ─── JWT helpers ─── */
function createToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

/* ─── Register ─── */
exports.registerStrategies = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill all fields' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashed,
      verified: false,
      verifyToken,
      contacts: []
    });

    await newUser.save();

    // Send verification email and return status/preview info
    let emailSent = true;
    let emailError = null;
    let previewUrl = null;
    try {
      const result = await sendVerificationEmail(email, name, verifyToken);
      if (result && result.previewUrl) previewUrl = result.previewUrl;
    } catch (emailErr) {
      emailSent = false;
      emailError = emailErr.message || String(emailErr);
      console.error('Email send failed:', emailError);
    }

    return res.status(201).json({
      message: 'Registration successful! Check your email to verify your account.',
      emailSent,
      emailError,
      previewUrl
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── Login ─── */
exports.loginStrategies = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.verified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.status(200).json({
      token: createToken(user),
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── Get current user ─── */
exports.getCurrentUser = [authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
}];

/* ─── Email verification ─── */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verifyToken: token });
    if (!user) {
      return res.status(400).send(`
        <html><body style="font-family:Inter,sans-serif;text-align:center;padding:60px;background:#FAF8F5;">
          <h2 style="color:#C6427E;">Invalid or expired verification link.</h2>
          <a href="/" style="color:#14162B;font-size:14px;">← Back to Cercle</a>
        </body></html>
      `);
    }
    user.verified = true;
    user.verifyToken = null;
    await user.save();

    return res.send(`
      <html><body style="font-family:Inter,sans-serif;text-align:center;padding:60px;background:#FAF8F5;">
        <div style="max-width:400px;margin:0 auto;">
          <div style="width:56px;height:56px;background:#C6427E;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 style="color:#14162B;font-size:22px;margin-bottom:10px;">Email verified!</h2>
          <p style="color:#6B7089;font-size:14px;">Your account is ready. You can now log in to Cercle.</p>
          <a href="/" style="display:inline-block;margin-top:22px;background:#14162B;color:#fff;padding:11px 26px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none;">Go to Cercle →</a>
        </div>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).send('Server error');
  }
};

exports.googleStrategy = (req, res) => res.status(501).json({ message: 'Google auth not configured' });
exports.googleCallback = (req, res) => res.status(501).json({ message: 'Google callback placeholder' });
exports.facebookStrategy = (req, res) => res.status(501).json({ message: 'Facebook auth not configured' });
exports.facebookCallback = (req, res) => res.status(501).json({ message: 'Facebook callback placeholder' });

exports.authenticate = authenticate;