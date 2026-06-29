const express = require('express');
const playerStore = require('../services/playerStore');
const gradingEngine = require('../services/gradingEngine');

const router = express.Router();

/**
 * POST /api/draft/grade
 * Grade a set of picks against the consensus pool.
 * Body: { picks: [playerId, ...] }
 */
router.post('/grade', async (req, res) => {
  try {
    const { picks } = req.body;
    if (!Array.isArray(picks) || !picks.length) {
      return res.status(400).json({ error: 'picks array required' });
    }

    const pool = await playerStore.getPlayers();
    const playerMap = new Map(pool.map((p) => [p.id, p]));
    const resolved = picks.map((id) => playerMap.get(id)).filter(Boolean);

    if (!resolved.length) {
      return res.status(400).json({ error: 'no valid player IDs found' });
    }

    const result = gradingEngine.grade(resolved, pool);
    res.json(result);
  } catch (err) {
    console.error('Error grading draft:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/draft/simulate
 * Simulate a snake draft with AI opponents.
 * Body: { yourSlot: 1, numTeams: 12, numRounds: 15, yourPicks: [playerId, ...] }
 */
router.post('/simulate', async (req, res) => {
  try {
    const { yourSlot = 1, numTeams = 12, numRounds = 15, yourPicks = [] } = req.body;

    const pool = await playerStore.getPlayers();
    const result = gradingEngine.simulateDraft(yourSlot, numTeams, numRounds, yourPicks, pool);

    // Also grade the user's picks so far
    const playerMap = new Map(pool.map((p) => [p.id, p]));
    const resolved = yourPicks.map((id) => playerMap.get(id)).filter(Boolean);
    const gradeResult = resolved.length ? gradingEngine.grade(resolved, pool) : null;

    res.json({ ...result, grade: gradeResult });
  } catch (err) {
    console.error('Error simulating draft:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/draft/recommend
 * Return AI-scored pick recommendations based on the current draft state.
 * Body: { yourSlot, numTeams, picks: [{ playerId, teamSlot }, ...] }
 */
router.post('/recommend', async (req, res) => {
  try {
    const { yourSlot = 1, numTeams = 12, picks = [] } = req.body;

    const pool = await playerStore.getPlayers();
    const result = gradingEngine.recommend({ yourSlot, numTeams, picks }, pool);
    res.json(result);
  } catch (err) {
    console.error('Error generating recommendations:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/draft/trade
 * Analyze a trade: compare total value of players given vs. received.
 * Body: { giving: [playerId, ...], getting: [playerId, ...], league?: { scoringFormat, superflex, numTeams, teReceptionPremium } }
 */
router.post('/trade', async (req, res) => {
  try {
    const { giving = [], getting = [], league = {} } = req.body;
    if (!giving.length || !getting.length) {
      return res.status(400).json({ error: 'Both giving and getting arrays required' });
    }

    const pool = await playerStore.getPlayers();
    const result = gradingEngine.analyzeTrade(giving, getting, pool, league);
    res.json(result);
  } catch (err) {
    console.error('Error analyzing trade:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
