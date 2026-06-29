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
