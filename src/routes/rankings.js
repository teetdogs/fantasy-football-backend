const express = require('express');
const RankingEngine = require('../services/rankingEngine');
const ESPNService = require('../services/espnService');

const router = express.Router();

// Pre-defined ranking strategies
const STRATEGIES = {
  balanced: {
    name: 'Balanced',
    weights: { adpWeight: 0.4, projectionWeight: 0.5, positionScarcityWeight: 0.1 },
    description: 'Balanced approach using ADP and projections equally',
  },
  adpHeavy: {
    name: 'ADP Heavy',
    weights: { adpWeight: 0.7, projectionWeight: 0.2, positionScarcityWeight: 0.1 },
    description: 'Emphasizes market consensus (ADP)',
  },
  projectionHeavy: {
    name: 'Projection Heavy',
    weights: { adpWeight: 0.2, projectionWeight: 0.7, positionScarcityWeight: 0.1 },
    description: 'Emphasizes projected output over consensus',
  },
  valueHeavy: {
    name: 'Value Focused',
    weights: { adpWeight: 0.3, projectionWeight: 0.3, positionScarcityWeight: 0.4 },
    description: 'Prioritizes position scarcity and value opportunities',
  },
};

let playersCache = null;

const initializeCache = () => {
  if (!playersCache) {
    const mockPlayers = ESPNService.getMockPlayers();
    playersCache = mockPlayers;
  }
  return playersCache;
};

/**
 * GET /api/rankings
 * Get pre-computed or compute rankings on demand
 * Query params:
 *   - strategy: Name of strategy (balanced, adpHeavy, projectionHeavy, valueHeavy)
 *   - groupBy: Group results by position
 */
router.get('/', (req, res) => {
  try {
    const players = initializeCache();
    const { strategy, groupBy } = req.query;

    const strategyName = strategy || 'balanced';
    const strategyObj = STRATEGIES[strategyName];

    if (!strategyObj) {
      return res.status(400).json({
        error: `Unknown strategy: ${strategyName}`,
        available: Object.keys(STRATEGIES),
      });
    }

    const options = groupBy ? { groupBy } : {};
    const ranked = RankingEngine.rankPlayers(players, strategyObj.weights, options);

    res.json({
      strategy: strategyObj,
      rankings: ranked,
    });
  } catch (error) {
    console.error('Error computing rankings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rankings/strategies
 * List all available ranking strategies
 */
router.get('/strategies', (req, res) => {
  try {
    const strategies = Object.values(STRATEGIES).map((s) => ({
      name: s.name,
      description: s.description,
      weights: s.weights,
    }));

    res.json(strategies);
  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
