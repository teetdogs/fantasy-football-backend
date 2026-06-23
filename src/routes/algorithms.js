const express = require('express');
const RankingEngine = require('../services/rankingEngine');
const playerStore = require('../services/playerStore');

const router = express.Router();

/**
 * POST /api/algorithms/test
 * Test a custom ranking algorithm with provided weights
 * Body:
 *   - weights: { adpWeight, projectionWeight, positionScarcityWeight }
 *   - position?: Filter by position
 *   - limit?: Limit results
 */
router.post('/test', async (req, res) => {
  try {
    const { weights, position, limit } = req.body;

    // Validate weights
    if (!weights) {
      return res.status(400).json({ error: 'weights object required' });
    }

    if (
      typeof weights.adpWeight !== 'number' ||
      typeof weights.projectionWeight !== 'number' ||
      typeof weights.positionScarcityWeight !== 'number'
    ) {
      return res.status(400).json({ error: 'weights must contain numeric values' });
    }

    // Normalize weights to sum to 1
    const total =
      weights.adpWeight + weights.projectionWeight + weights.positionScarcityWeight;
    const normalizedWeights = {
      adpWeight: weights.adpWeight / total,
      projectionWeight: weights.projectionWeight / total,
      positionScarcityWeight: weights.positionScarcityWeight / total,
    };

    let players = await playerStore.getPlayers();

    // Filter by position if provided
    if (position) {
      players = players.filter((p) => p.position === position.toUpperCase());
    }

    // Rank with custom weights
    const ranked = RankingEngine.rankPlayers(players, normalizedWeights);

    // Apply limit if provided
    const result = limit ? ranked.slice(0, parseInt(limit)) : ranked;

    res.json({
      weights: normalizedWeights,
      position: position || 'All',
      count: result.length,
      rankings: result,
    });
  } catch (error) {
    console.error('Error testing algorithm:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/algorithms/compare
 * Compare multiple ranking strategies side-by-side
 * Body:
 *   - strategies: Array of { name, weights }
 */
router.post('/compare', async (req, res) => {
  try {
    const { strategies } = req.body;

    if (!Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({ error: 'strategies array required with at least 1 item' });
    }

    const players = await playerStore.getPlayers();

    // Compare strategies
    const comparison = RankingEngine.compareStrategies(
      players,
      strategies.map((s) => ({
        name: s.name,
        weights: s.weights,
      }))
    );

    res.json({
      strategies: strategies.map((s) => s.name),
      comparison,
    });
  } catch (error) {
    console.error('Error comparing algorithms:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
