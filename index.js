const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { engine } = require('express-handlebars');
const helmet = require('helmet');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const rateLimit = require('express-rate-limit');
const { checkPassword, csrf } = require('./src/auth');
const { getStats } = require('./src/stats');

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('SESSION_SECRET must be set to a random string of 32+ characters');
  process.exit(1);
}
// Secure cookies need HTTPS. Set COOKIE_SECURE=false to test over plain http on your LAN.
const COOKIE_SECURE = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD;

const app = express();
app.disable('x-powered-by');
// One proxy hop (Tailscale Funnel). If every visitor shows up as 127.0.0.1, adjust TRUST_PROXY.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Health check stays outside rate limiting and auth
app.get('/health', (req, res) => res.sendStatus(200));

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
}));

app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1h' : 0 }));

app.use(session({
  name: 'sysmon.sid',
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 15 * 60 * 1000 }), // prunes expired sessions
  cookie: { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 },
}));

// Only failed attempts count toward the limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('login', {
      title: 'Sign in',
      error: 'Too many failed attempts. Try again in 15 minutes.',
      csrfToken: csrf.token(req),
    }),
});

const form = express.urlencoded({ extended: false, limit: '4kb' });
const pageAuth = (req, res, next) => (req.session.authed ? next() : res.redirect('/login'));
const apiAuth = (req, res, next) => (req.session.authed ? next() : res.status(401).json({ error: 'unauthorized' }));

app.get('/login', (req, res) => {
  if (req.session.authed) return res.redirect('/');
  res.render('login', { title: 'Sign in', csrfToken: csrf.token(req) });
});

app.post('/login', loginLimiter, form, async (req, res) => {
  if (!csrf.valid(req)) {
    return res.status(403).render('login', { title: 'Sign in', error: 'Session expired. Try again.', csrfToken: csrf.token(req) });
  }
  if (!(await checkPassword(req.body.password))) {
    return res.status(401).render('login', { title: 'Sign in', error: 'Wrong password.', csrfToken: csrf.token(req) });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Session error');
    req.session.authed = true;
    res.redirect('/');
  });
});

app.post('/logout', form, (req, res) => {
  if (!csrf.valid(req)) return res.status(403).send('Forbidden');
  req.session.destroy(() => {
    res.clearCookie('sysmon.sid');
    res.redirect('/login');
  });
});

app.get('/', pageAuth, (req, res) => {
  res.render('dashboard', { title: 'Status', hostname: os.hostname(), csrfToken: csrf.token(req) });
});

app.get('/api/stats', apiAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getStats());
});

app.use((req, res) => res.status(404).send('Not found'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Server error');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`sysmon listening on ${PORT} (${PROD ? 'production' : 'development'})`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
