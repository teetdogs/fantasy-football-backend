const express = require('express');
const leagueService = require('../services/espnLeagueService');

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

module.exports = router;
