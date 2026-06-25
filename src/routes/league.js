const express = require('express');
const leagueService = require('../services/espnLeagueService');
const playerStore = require('../services/playerStore');
const seasonManager = require('../services/seasonManager');

const router = express.Router();

/**
 * POST /api/league/connect
 * Test ESPN credentials and return basic league info.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/connect', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const result = await leagueService.testConnection(leagueId, swid, espnS2);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/settings
 * Fetch full league settings (roster slots, scoring, draft config).
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/settings', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const settings = await leagueService.fetchLeagueSettings(leagueId, swid, espnS2);
    res.json(settings);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/teams
 * Fetch all teams in the league.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/teams', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const teams = await leagueService.fetchLeagueTeams(leagueId, swid, espnS2);
    res.json({ teams });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/draft
 * Fetch draft results.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/draft', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const draft = await leagueService.fetchDraftResults(leagueId, swid, espnS2);
    res.json(draft);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/debug
 * Return raw ESPN team + member data for debugging.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/debug', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const season = process.env.SEASON || '2026';
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`;
    const r = await fetch(url, {
      headers: {
        Cookie: `SWID=${swid}; espn_s2=${espnS2}`,
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });
    const raw = await r.json();
    res.json({
      teams: (raw.teams || []).map((t) => ({ id: t.id, location: t.location, nickname: t.nickname, abbrev: t.abbrev, name: t.name, primaryOwner: t.primaryOwner })),
      members: (raw.members || []).map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, displayName: m.displayName })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/league/my-team
 * Season Manager: returns the user's enriched roster, waiver-wire upgrade
 * suggestions, and drop candidates.
 * Body: { leagueId, swid, espnS2, teamId }
 */
router.post('/my-team', async (req, res) => {
  try {
    const { leagueId, swid, espnS2, teamId } = req.body;
    if (!leagueId || !swid || !espnS2 || !teamId) {
      return res.status(400).json({ error: 'leagueId, swid, espnS2, and teamId are all required' });
    }

    const result = await seasonManager.buildMyTeam({ leagueId, swid, espnS2, teamId: Number(teamId) });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/draft-live
 * Fetch draft picks enriched with player pool data (names, positions, teams).
 * Designed to be polled during a live draft.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/draft-live', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const [draft, pool] = await Promise.all([
      leagueService.fetchDraftResults(leagueId, swid, espnS2),
      playerStore.getPlayers(),
    ]);

    const playerMap = new Map(pool.map((p) => [p.id, p]));

    // ESPN pre-creates every draft slot with playerId = -1 once the draft
    // room opens. Those are empty placeholders, not real picks — filter them
    // out so we only ever surface players that have actually been drafted.
    const picks = draft.picks
      .filter((pick) => pick.playerId > 0)
      .map((pick) => {
        const player = playerMap.get(pick.playerId);
        return {
          overall: pick.overall,
          round: pick.round,
          pick: pick.pick,
          teamId: pick.teamId,
          playerId: pick.playerId,
          playerName: player?.name || `ESPN #${pick.playerId}`,
          position: player?.position || '??',
          team: player?.team || '',
          keeper: pick.keeper,
        };
      });

    // The draft room can be open (slots created) before any real pick is made.
    // Treat it as in-progress when ESPN flags it open or once real picks land.
    const roomOpen = (draft.picks || []).length > 0;

    res.json({
      drafted: draft.drafted,
      roomOpen,
      inProgress: roomOpen && !draft.drafted,
      pickCount: picks.length,
      picks,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
