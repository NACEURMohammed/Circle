function isEmailConfigured(env = process.env) {
  return Boolean(env.EMAIL_HOST && env.EMAIL_USER && env.EMAIL_PASS);
}

function resolvePort(env = process.env) {
  const port = Number(env.PORT || '3000');
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

module.exports = { isEmailConfigured, resolvePort };
