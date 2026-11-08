// Usage: node scripts/set-password.js [output-path]   (default ./data/auth.json)
const { scryptSync, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

(async () => {
  const out = process.argv[2] || './data/auth.json';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question('New password (12+ characters): ');
  rl.close();
  if (pw.length < 12) {
    console.error('Too short.');
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ salt: salt.toString('hex'), hash: hash.toString('hex') }), { mode: 0o600 });
  console.log(`Saved ${out}`);
})();
