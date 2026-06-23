/**
 * Ranking Engine - combines ADP, projections, and custom weights into player scores
 */

class RankingEngine {
  /**
   * Default weights for ranking strategies
   */
  static DEFAULT_WEIGHTS = {
    adpWeight: 0.4,
    projectionWeight: 0.5,
    positionScarcityWeight: 0.1,
  };

  /**
   * Calculate score for a single player
   * @param {Object} player - Player data including adp, projected_points, position
   * @param {Object} weights - Custom weights for scoring
   * @param {Object} context - Context data (position counts, averages, etc.)
   * @returns {number} Final score
   */
  static calculatePlayerScore(player, weights = {}, context = {}) {
    const w = { ...RankingEngine.DEFAULT_WEIGHTS, ...weights };

    // ADP score (lower ADP = higher score, normalize to 0-100)
    const adpScore = player.adp ? Math.max(0, 100 - player.adp) : 0;

    // Projection score (normalize projections to 0-100 scale based on context)
    const maxProjection = context.maxProjection || 30;
    const projectionScore = player.projected_points
      ? (player.projected_points / maxProjection) * 100
      : 0;

    // Position scarcity score (how many top players at this position)
    const positionScarcityScore = context.positionScarcity?.[player.position] || 50;

    // Calculate weighted score
    const finalScore =
      adpScore * w.adpWeight +
      projectionScore * w.projectionWeight +
      positionScarcityScore * w.positionScarcityWeight;

    return Math.round(finalScore * 100) / 100;
  }

  /**
   * Rank a list of players using custom weights
   * @param {Array} players - Array of player objects
   * @param {Object} weights - Custom ranking weights
   * @param {Object} options - Additional options (groupBy, limit, etc.)
   * @returns {Array} Ranked players
   */
  static rankPlayers(players, weights = {}, options = {}) {
    if (!Array.isArray(players) || players.length === 0) {
      return [];
    }

    // Calculate context (max projection, position scarcity)
    const context = this.calculateContext(players);

    // Score each player
    const scoredPlayers = players.map((player) => ({
      ...player,
      score: this.calculatePlayerScore(player, weights, context),
    }));

    // Sort by score (descending)
    const ranked = scoredPlayers.sort((a, b) => b.score - a.score);

    // Add rank field
    const rankedWithPositions = ranked.map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

    // Group by position if requested
    if (options.groupBy === 'position') {
      return this.groupByPosition(rankedWithPositions);
    }

    // Limit results if requested
    if (options.limit) {
      return rankedWithPositions.slice(0, options.limit);
    }

    return rankedWithPositions;
  }

  /**
   * Calculate context metrics for normalization
   * @param {Array} players - Array of player objects
   * @returns {Object} Context with max projection, position scarcity, etc.
   */
  static calculateContext(players) {
    const positions = {};

    players.forEach((player) => {
      if (!positions[player.position]) {
        positions[player.position] = [];
      }
      positions[player.position].push(player.projected_points || 0);
    });

    // Calculate position scarcity (top 5 average at position)
    const positionScarcity = {};
    Object.entries(positions).forEach(([pos, scores]) => {
      const topFive = scores.sort((a, b) => b - a).slice(0, 5);
      positionScarcity[pos] = (topFive.reduce((a, b) => a + b, 0) / 5 / 30) * 100;
    });

    return {
      maxProjection: Math.max(...players.map((p) => p.projected_points || 0)),
      positionScarcity,
      positions,
    };
  }

  /**
   * Group ranked players by position
   * @param {Array} rankedPlayers - Already ranked players
   * @returns {Object} Players grouped by position
   */
  static groupByPosition(rankedPlayers) {
    const grouped = {};
    rankedPlayers.forEach((player) => {
      if (!grouped[player.position]) {
        grouped[player.position] = [];
      }
      grouped[player.position].push(player);
    });
    return grouped;
  }

  /**
   * Compare two ranking strategies
   * @param {Array} players - Players to rank
   * @param {Array} strategies - Array of strategy objects with name and weights
   * @returns {Object} Comparison results
   */
  static compareStrategies(players, strategies) {
    const results = {};
    strategies.forEach((strategy) => {
      results[strategy.name] = this.rankPlayers(players, strategy.weights, {
        groupBy: 'position',
      });
    });
    return results;
  }
}

module.exports = RankingEngine;
