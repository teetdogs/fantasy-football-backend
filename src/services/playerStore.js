/**
 * Player store — single source of truth for the player pool.
 *
 * Pulls live data from ESPN, caches it in memory with a TTL, and transparently
 * falls back to bundled mock data if ESPN is unreachable so the API never fails.
 */

const espnLive = require('./espnLiveService');
const ESPNService = require('./espnService');

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
    const players = await espnLive.fetchPlayers({ limit: PLAYER_LIMIT });
    if (!players.length) throw new Error('ESPN returned 0 players');
    cache = { players, source: 'espn', fetchedAt: Date.now() };
    console.log(`[playerStore] loaded ${players.length} players from ESPN`);
  } catch (err) {
    console.error(`[playerStore] ESPN fetch failed, using mock data: ${err.message}`);
    // Only fall back if we have nothing cached at all.
    if (!cache.players) {
      cache = { players: ESPNService.getMockPlayers(), source: 'mock', fetchedAt: Date.now() };
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
