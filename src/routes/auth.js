const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/connection');

const router = express.Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/**
 * GET /api/auth/google
 * Redirect the user to Google's consent screen.
 */
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

/**
 * GET /api/auth/google/callback
 * Google redirects here after consent. Exchange code for tokens,
 * fetch profile, upsert user, create session.
 */
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}?auth=error&reason=no_code`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, picture)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         picture = EXCLUDED.picture,
         updated_at = NOW()
       RETURNING id, google_id, email, name, picture, espn_league_id, espn_team_id`,
      [googleId, email, name, picture]
    );

    const user = result.rows[0];
    req.session.userId = user.id;

    res.redirect(`${FRONTEND_URL}?auth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}?auth=error&reason=oauth_failed`);
  }
});

/**
 * GET /api/auth/me
 * Return the current user if logged in.
 */
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, name, picture, espn_league_id, espn_team_id FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (!result.rows.length) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * POST /api/auth/logout
 * Destroy the session.
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

/**
 * POST /api/auth/link-league
 * Associate the logged-in user with an ESPN league + team.
 */
router.post('/link-league', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { espnLeagueId, espnTeamId } = req.body;
  if (!espnLeagueId) {
    return res.status(400).json({ error: 'espnLeagueId required' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET espn_league_id = $1, espn_team_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, name, picture, espn_league_id, espn_team_id`,
      [espnLeagueId, espnTeamId || null, req.session.userId]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error linking league:', err);
    res.status(500).json({ error: 'Failed to link league' });
  }
});

module.exports = router;
