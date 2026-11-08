const fs = require('node:fs');
const { scrypt, timingSafeEqual, randomBytes } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const AUTH_FILE = process.env.AUTH_FILE || './data/auth.json';

// Read the salted hash once at startup. To change the password, rerun scripts/set-password.js and restart.
let creds;
try {
  const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  creds = { salt: Buffer.from(raw.salt, 'hex'), hash: Buffer.from(raw.hash, 'hex') };
} catch {
  console.error(`Cannot read ${AUTH_FILE}. Create it with: node scripts/set-password.js <path>`);
  process.exit(1);
}

async function checkPassword(input) {
  const attempt = String(input ?? '').slice(0, 256);
  const actual = await scryptAsync(attempt, creds.salt, creds.hash.length);
  return timingSafeEqual(actual, creds.hash);
}

// Minimal per-session CSRF token for the two forms
const csrf = {
  token(req) {
    if (!req.session.csrf) req.session.csrf = randomBytes(24).toString('hex');
    return req.session.csrf;
  },
  valid(req) {
    const sent = Buffer.from(String(req.body?._csrf ?? ''));
    const real = Buffer.from(req.session.csrf ?? '');
    return real.length > 0 && sent.length === real.length && timingSafeEqual(sent, real);
  },
};

module.exports = { checkPassword, csrf };
