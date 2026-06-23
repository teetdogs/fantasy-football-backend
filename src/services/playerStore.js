/**
 * Player store — single source of truth for the player pool.
 *
 * Pulls live data from ESPN, caches it in memory with a TTL, and transparently
 * falls back to bundled mock data if ESPN is unreachable so the API never fails.
 */

const espnLive = require('./espnLiveService');
const ESPNService = require('./espnService');
const statsService = require('./statsService');

const TTL_MS = parseInt(process.env.PLAYER_CACHE_TTL_MS || `${6 * 60 * 60 * 1000}`, 10); // 6h
const PLAYER_LIMIT = parseInt(process.env.PLAYER_LIMIT || '300', 10);

let cache = {
  players: null,
  source: null, // 'espn' | 'mock'
  fetchedAt: 0,
};

let inflight = null;

function isFresh() {
  return cache.players && Date.now() - cache.fetchedAt < TTL_MS;
}

async function refresh() {
  try {
    const raw = await espnLive.fetchPlayers({ limit: PLAYER_LIMIT });
    if (!raw.length) throw new Error('ESPN returned 0 players');
    const players = raw.map(statsService.enrich); // attach real last-season stats
    cache = { players, source: 'espn', fetchedAt: Date.now() };
    const withStats = players.filter((p) => p.lastSeason).length;
    console.log(`[playerStore] loaded ${players.length} players from ESPN (${withStats} with ${statsService.SEASON} stats)`);
  } catch (err) {
    console.error(`[playerStore] ESPN fetch failed, using mock data: ${err.message}`);
    // Only fall back if we have nothing cached at all.
    if (!cache.players) {
      const players = ESPNService.getMockPlayers().map(statsService.enrich);
      cache = { players, source: 'mock', fetchedAt: Date.now() };
    }
  }
  return cache.players;
}

/**
 * Returns the cached player pool, refreshing in the background when stale.
 * Concurrent callers during a refresh share the same in-flight promise.
 */
async function getPlayers() {
  if (isFresh()) return cache.players;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  // If we already have (stale) data, serve it immediately; otherwise await.
  return cache.players || inflight;
}

function getMeta() {
  return {
    source: cache.source,
    count: cache.players ? cache.players.length : 0,
    fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
  };
}

module.exports = { getPlayers, refresh, getMeta };
