/**
 * Stats service — loads the pre-computed real-season stats (built offline by
 * scripts/build_player_stats.py) and merges them onto players by ESPN id.
 *
 * The JSON is small (~100KB) and immutable, so we require it once at startup.
 */

let data = { season: null, players: {} };
try {
  // eslint-disable-next-line global-require
  data = require('../data/playerStats.json');
} catch (err) {
  console.warn(`[statsService] no playerStats.json found — stats disabled (${err.message})`);
}

const SEASON = data.season;

/**
 * Return the real last-season stat line for an ESPN id, or null.
 */
function getStats(espnId) {
  const s = data.players[String(espnId)];
  return s ? { season: SEASON, ...s } : null;
}

/**
 * Attach `lastSeason` to a player object (returns a new object).
 */
function enrich(player) {
  return { ...player, lastSeason: getStats(player.espn_id) };
}

module.exports = { getStats, enrich, SEASON };
