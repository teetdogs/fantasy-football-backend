const express = require('express');
const leagueService = require('../services/espnLeagueService');
const seasonManager = require('../services/seasonManager');

const router = express.Router();

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
 * POST /api/league/trade-suggestions
 * Suggest trades based on roster surplus/need across all teams.
 * Body: { leagueId, swid, espnS2, teamId }
 */
router.post('/trade-suggestions', async (req, res) => {
  try {
    const { leagueId, swid, espnS2, teamId } = req.body;
    if (!leagueId || !swid || !espnS2 || !teamId) {
      return res.status(400).json({ error: 'leagueId, swid, espnS2, and teamId are all required' });
    }

    const result = await seasonManager.suggestTrades({ leagueId, swid, espnS2, teamId: Number(teamId) });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /api/league/power-rankings
 * Grade every team in the league and return a sorted leaderboard.
 * Body: { leagueId, swid, espnS2 }
 */
router.post('/power-rankings', async (req, res) => {
  try {
    const { leagueId, swid, espnS2 } = req.body;
    if (!leagueId || !swid || !espnS2) {
      return res.status(400).json({ error: 'leagueId, swid, and espnS2 are all required' });
    }

    const result = await seasonManager.leaguePowerRankings({ leagueId, swid, espnS2 });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
