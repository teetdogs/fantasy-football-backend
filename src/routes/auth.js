const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/connection');

const router = express.Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Fresh client per request — OAuth2Client holds mutable token state, so a
// shared instance would let concurrent logins clobber each other.
const makeClient = () => new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/**
 * GET /api/auth/google
 * Redirect the user to Google's consent screen.
 */
router.get('/google', (req, res) => {
  // CSRF protection: generate a random state, stash it in the session, and
  // verify it matches when Google redirects back. Blocks login-CSRF attacks.
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const url = makeClient().generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
  res.redirect(url);
});

/**
 * GET /api/auth/google/callback
 * Google redirects here after consent. Exchange code for tokens,
 * fetch profile, upsert user, create session.
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}?auth=error&reason=no_code`);
  }

  // Verify the state matches what we issued — reject mismatches (CSRF).
  const expectedState = req.session.oauthState;
  delete req.session.oauthState;
  if (!state || !expectedState || state !== expectedState) {
    return res.redirect(`${FRONTEND_URL}?auth=error&reason=bad_state`);
  }

  try {
    const client = makeClient();
    const { tokens } = await client.getToken(code);

    const ticket = await client.verifyIdToken({
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

  const { espnLeagueId, espnTeamId, espnSwid, espnS2 } = req.body;
  if (!espnLeagueId) {
    return res.status(400).json({ error: 'espnLeagueId required' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET espn_league_id = $1, espn_team_id = $2, espn_swid = $3, espn_s2 = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, name, picture, espn_league_id, espn_team_id`,
      [espnLeagueId, espnTeamId || null, espnSwid || null, espnS2 || null, req.session.userId]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error linking league:', err);
    res.status(500).json({ error: 'Failed to link league' });
  }
});

/**
 * GET /api/auth/league-creds
 * Return saved ESPN credentials for the logged-in user.
 * Cookies are sensitive — only return them to the authenticated owner.
 */
router.get('/league-creds', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const result = await pool.query(
      'SELECT espn_league_id, espn_team_id, espn_swid, espn_s2 FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (!result.rows.length || !result.rows[0].espn_league_id) {
      return res.json({ linked: false });
    }

    const row = result.rows[0];
    res.json({
      linked: true,
      leagueId: row.espn_league_id,
      teamId: row.espn_team_id,
      swid: row.espn_swid,
      espnS2: row.espn_s2,
    });
  } catch (err) {
    console.error('Error fetching league creds:', err);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

module.exports = router;
