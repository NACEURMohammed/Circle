const test = require('node:test');
const assert = require('node:assert/strict');

const { isEmailConfigured, resolvePort } = require('../utils/config');

test('detects email configuration when SMTP credentials are present', () => {
  const env = {
    EMAIL_HOST: 'smtp.example.com',
    EMAIL_USER: 'user@example.com',
    EMAIL_PASS: 'secret'
  };

  assert.equal(isEmailConfigured(env), true);
});

test('falls back to a usable port when PORT is not set', () => {
  assert.equal(resolvePort({ PORT: '' }), 3000);
  assert.equal(resolvePort({ PORT: '4000' }), 4000);
});
