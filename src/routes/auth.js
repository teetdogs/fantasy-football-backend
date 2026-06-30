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

// Make exactly one of a user's leagues active.
async function setActiveLeague(userId, espnLeagueId) {
  await pool.query('UPDATE user_leagues SET is_active = FALSE WHERE user_id = $1', [userId]);
  await pool.query(
    'UPDATE user_leagues SET is_active = TRUE WHERE user_id = $1 AND espn_league_id = $2',
    [userId, espnLeagueId]
  );
}

function mapLeagueRow(r) {
  return {
    leagueId: r.espn_league_id,
    teamId: r.espn_team_id,
    name: r.league_name,
    swid: r.espn_swid,
    espnS2: r.espn_s2,
    isActive: r.is_active,
  };
}

/**
 * POST /api/auth/link-league
 * Add or update one of the user's leagues. Becomes active automatically.
 */
router.post('/link-league', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { espnLeagueId, espnTeamId, espnSwid, espnS2, leagueName } = req.body;
  if (!espnLeagueId) {
    return res.status(400).json({ error: 'espnLeagueId required' });
  }

  try {
    await pool.query(
      `INSERT INTO user_leagues (user_id, espn_league_id, espn_team_id, league_name, espn_swid, espn_s2)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, espn_league_id) DO UPDATE SET
         espn_team_id = COALESCE(EXCLUDED.espn_team_id, user_leagues.espn_team_id),
         league_name = COALESCE(EXCLUDED.league_name, user_leagues.league_name),
         espn_swid = EXCLUDED.espn_swid,
         espn_s2 = EXCLUDED.espn_s2`,
      [req.session.userId, espnLeagueId, espnTeamId || null, leagueName || null, espnSwid || null, espnS2 || null]
    );
    await setActiveLeague(req.session.userId, espnLeagueId);

    const { rows } = await pool.query(
      'SELECT * FROM user_leagues WHERE user_id = $1 ORDER BY created_at ASC',
      [req.session.userId]
    );
    res.json({ leagues: rows.map(mapLeagueRow) });
  } catch (err) {
    console.error('Error linking league:', err);
    res.status(500).json({ error: 'Failed to link league' });
  }
});

/**
 * GET /api/auth/leagues
 * List all of the user's leagues (with creds — owner only) + which is active.
 */
router.get('/leagues', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_leagues WHERE user_id = $1 ORDER BY created_at ASC',
      [req.session.userId]
    );
    const leagues = rows.map(mapLeagueRow);
    const active = leagues.find((l) => l.isActive) || leagues[0] || null;
    res.json({ leagues, activeLeagueId: active ? active.leagueId : null });
  } catch (err) {
    console.error('Error listing leagues:', err);
    res.status(500).json({ error: 'Failed to list leagues' });
  }
});

/**
 * PUT /api/auth/leagues/active
 * Switch the active league. Body: { espnLeagueId }
 */
router.put('/leagues/active', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const { espnLeagueId } = req.body;
  if (!espnLeagueId) {
    return res.status(400).json({ error: 'espnLeagueId required' });
  }
  try {
    await setActiveLeague(req.session.userId, espnLeagueId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error switching league:', err);
    res.status(500).json({ error: 'Failed to switch league' });
  }
});

/**
 * DELETE /api/auth/leagues/:leagueId
 * Remove a league. If it was active, promote the most-recent remaining one.
 */
router.delete('/leagues/:leagueId', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const { rows: deleted } = await pool.query(
      'DELETE FROM user_leagues WHERE user_id = $1 AND espn_league_id = $2 RETURNING is_active',
      [req.session.userId, req.params.leagueId]
    );

    // If we removed the active league, promote another so one stays active.
    if (deleted[0]?.is_active) {
      const { rows: remaining } = await pool.query(
        'SELECT espn_league_id FROM user_leagues WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.session.userId]
      );
      if (remaining[0]) await setActiveLeague(req.session.userId, remaining[0].espn_league_id);
    }

    const { rows } = await pool.query(
      'SELECT * FROM user_leagues WHERE user_id = $1 ORDER BY created_at ASC',
      [req.session.userId]
    );
    res.json({ leagues: rows.map(mapLeagueRow) });
  } catch (err) {
    console.error('Error removing league:', err);
    res.status(500).json({ error: 'Failed to remove league' });
  }
});

/**
 * GET /api/auth/league-creds
 * Return the ACTIVE league's credentials (backward compat for callers that
 * still expect a single league). Owner only.
 */
router.get('/league-creds', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM user_leagues WHERE user_id = $1
       ORDER BY is_active DESC, created_at ASC LIMIT 1`,
      [req.session.userId]
    );
    if (!rows.length) return res.json({ linked: false });
    const l = mapLeagueRow(rows[0]);
    res.json({ linked: true, leagueId: l.leagueId, teamId: l.teamId, swid: l.swid, espnS2: l.espnS2 });
  } catch (err) {
    console.error('Error fetching league creds:', err);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

module.exports = router;
