/**
 * Player store — single source of truth for the player pool.
 *
 * Pulls live data from ESPN (primary), enriches with real last-season stats
 * (nflverse), then overlays Sleeper ADP + FantasyPros ECR and computes a
 * multi-source consensus ranking. Falls back to mock data if ESPN is down.
 */

const espnLive = require('./espnLiveService');
const ESPNService = require('./espnService');
const statsService = require('./statsService');
const crosswalk = require('./crosswalk');
const multiSource = require('./multiSource');

const TTL_MS = parseInt(process.env.PLAYER_CACHE_TTL_MS || `${6 * 60 * 60 * 1000}`, 10); // 6h
const PLAYER_LIMIT = parseInt(process.env.PLAYER_LIMIT || '300', 10);

let cache = {
  players: null,
  source: null, // 'espn' | 'mock'
  sources: [],  // which enrichment sources succeeded
  fetchedAt: 0,
};

let inflight = null;

function isFresh() {
  return cache.players && Date.now() - cache.fetchedAt < TTL_MS;
}

async function refresh() {
  // Ensure crosswalk is loaded (needed by Sleeper + FP services)
  await crosswalk.load();

  let players;
  let primarySource = 'espn';

  try {
    const raw = await espnLive.fetchPlayers({ limit: PLAYER_LIMIT });
    if (!raw.length) throw new Error('ESPN returned 0 players');
    players = raw.map(statsService.enrich);
    const withStats = players.filter((p) => p.lastSeason).length;
    console.log(
      `[playerStore] loaded ${players.length} players from ESPN (${withStats} with ${statsService.SEASON} stats)`
    );
  } catch (err) {
    console.error(`[playerStore] ESPN fetch failed, using mock data: ${err.message}`);
    if (cache.players) return cache.players; // keep serving stale cache
    players = ESPNService.getMockPlayers().map(statsService.enrich);
    primarySource = 'mock';
  }

  // Fetch secondary sources in parallel (non-blocking — failures are logged, not thrown)
  const activeSources = [primarySource, 'nflverse'];
  try {
    const extra = await multiSource.fetchAll();
    if (Object.keys(extra.sleeper).length > 0) activeSources.push('sleeper');
    if (Object.keys(extra.fantasyPros).length > 0) activeSources.push('fantasyPros');
    multiSource.enrich(players, extra);
  } catch (err) {
    console.error(`[playerStore] multi-source enrichment failed: ${err.message}`);
  }

  cache = { players, source: primarySource, sources: activeSources, fetchedAt: Date.now() };
  console.log(`[playerStore] ready — sources: ${activeSources.join(', ')}`);
  return cache.players;
}

async function getPlayers() {
  if (isFresh()) return cache.players;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return cache.players || inflight;
}

function getMeta() {
  return {
    source: cache.source,
    sources: cache.sources,
    count: cache.players ? cache.players.length : 0,
    fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
  };
}

// Proactive background refresh — don't rely on traffic to keep data fresh.
// Runs every TTL interval so roster cuts, injuries, and projections stay
// current even if nobody visits for a while.
// .unref() so this timer alone doesn't keep the process alive: the server's
// HTTP listener holds it open in production, while one-off scripts that just
// import this module can still exit cleanly when their work is done.
const refreshTimer = setInterval(() => {
  console.log('[playerStore] background refresh triggered');
  refresh().catch((err) => console.error('[playerStore] background refresh failed:', err.message));
}, TTL_MS);
refreshTimer.unref();

module.exports = { getPlayers, refresh, getMeta };
