const express = require('express');
const RankingEngine = require('../services/rankingEngine');
const playerStore = require('../services/playerStore');

const router = express.Router();

/**
 * GET /api/players
 * Fetch and rank players
 * Query params:
 *   - position: Filter by position (QB, RB, WR, TE, K, DEF)
 *   - weights: JSON string with ranking weights
 *   - limit: Limit number of results
 */
router.get('/', async (req, res) => {
  try {
    const players = await playerStore.getPlayers();
    const { position, weights, limit } = req.query;

    let filteredPlayers = players;

    // Filter by position if provided
    if (position) {
      filteredPlayers = players.filter((p) => p.position === position.toUpperCase());
    }

    // Parse weights if provided
    let rankingWeights = undefined;
    if (weights) {
      try {
        rankingWeights = JSON.parse(weights);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid weights JSON' });
      }
    }

    // Rank players
    const ranked = RankingEngine.rankPlayers(filteredPlayers, rankingWeights);

    // Apply limit if provided
    const limited = limit ? ranked.slice(0, parseInt(limit)) : ranked;

    res.json(limited);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/players/:id
 * Get a specific player
 */
router.get('/:id', async (req, res) => {
  try {
    const players = await playerStore.getPlayers();
    const player = players.find((p) => p.espn_id === req.params.id);

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(player);
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
