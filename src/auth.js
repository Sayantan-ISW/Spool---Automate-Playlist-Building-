'use strict';

const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Create a new OAuth2 client from env vars.
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate the Google consent URL.
 */
function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

/**
 * Exchange auth code for tokens.
 */
async function getTokens(oauth2Client, code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Middleware: ensure the user is authenticated.
 * Attaches an authorized oauth2Client to req.oauth2Client.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated. Please sign in with Google.' });
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(req.session.tokens);

  // Listen for token refresh and update session
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      req.session.tokens.refresh_token = tokens.refresh_token;
    }
    req.session.tokens.access_token = tokens.access_token;
    req.session.tokens.expiry_date = tokens.expiry_date;
  });

  req.oauth2Client = oauth2Client;
  next();
}

/**
 * Revoke the user's token.
 */
async function revokeToken(oauth2Client, token) {
  try {
    await oauth2Client.revokeToken(token);
  } catch (err) {
    // Token may already be invalid — that's fine
  }
}

module.exports = { createOAuth2Client, getAuthUrl, getTokens, requireAuth, revokeToken };
