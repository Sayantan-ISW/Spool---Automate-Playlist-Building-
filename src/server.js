'use strict';

require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the reverse proxy (Vercel, etc.) so secure cookies work behind HTTPS proxies
app.set('trust proxy', 1);

// ─── Security Middleware ────────────────────────────────────────────────────

// Helmet for secure headers (CSP configured below)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'https://i.ytimg.com', 'https://*.ytimg.com', 'https://lh3.googleusercontent.com', 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Cookie parser
app.use(cookieParser());

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Session (cookie-based for serverless compatibility)
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'replace_with_openssl_rand_hex_32_output') {
  console.warn('WARNING: SESSION_SECRET is not set or is the default value. Generating a random one for this run.');
}

app.use(cookieSession({
  name: 'spool_session',
  keys: [sessionSecret || crypto.randomBytes(32).toString('hex')],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
}));

// cookie-session doesn't have regenerate/save by default — shim for compatibility
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb) => { if (cb) cb(); };
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb) => { if (cb) cb(); };
  }
  next();
});

// CSRF protection via double-submit cookie pattern
app.use((req, res, next) => {
  // Generate CSRF token if not present
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  // Set CSRF token cookie (readable by JS)
  res.cookie('XSRF-TOKEN', req.session.csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  // Validate on state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const token = req.headers['x-xsrf-token'] || req.body?._csrf;
    if (token !== req.session.csrfToken) {
      return res.status(403).json({ error: 'Invalid CSRF token.' });
    }
  }

  next();
});

// Rate limiting — 5 preview/create requests per minute per session
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.session?.id || req.ip,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.use('/api/', apiLimiter);

// ─── Static Files ───────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Routes ─────────────────────────────────────────────────────────────────

app.use(routes);

// Serve SPA for all unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Error Handler ──────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ─── Start ──────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Spool running at http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop.');
  });
}

module.exports = app;
