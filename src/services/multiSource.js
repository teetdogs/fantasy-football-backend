/**
 * Multi-source data aggregator.
 * Fetches from Sleeper + FantasyPros in parallel, merges onto the ESPN-based
 * player pool, and computes a consensus ranking from all available signals.
 *
 * Design: ESPN remains the primary source (pool definition, projections, ADP).
 * Sleeper and FantasyPros are enrichment layers. If either fails, the player
 * pool still works — graceful degradation per source.
 */

const sleeperService = require('./sleeperService');
const fantasyProsService = require('./fantasyProsService');

/**
 * Fetch all secondary sources in parallel, returning { sleeper, fantasyPros }.
 * Each is a map of espnId -> source-specific data, or {} on failure.
 */
async function fetchAll() {
  const [sleeper, fantasyPros] = await Promise.all([
    sleeperService.fetchSleeperADP().catch((err) => {
      console.error(`[multiSource] Sleeper failed: ${err.message}`);
      return {};
    }),
    fantasyProsService.fetchECR().catch((err) => {
      console.error(`[multiSource] FantasyPros failed: ${err.message}`);
      return {};
    }),
  ]);

  return { sleeper, fantasyPros };
}

/**
 * Normalize a rank to a 0–100 score (lower rank = higher score).
 * rank 1 → ~100, rank 300 → ~0.
 */
function rankToScore(rank, poolSize = 300) {
  if (rank == null || rank <= 0) return null;
  return Math.max(0, ((poolSize - rank + 1) / poolSize) * 100);
}

/**
 * Merge multi-source data onto an array of ESPN-based players.
 * Mutates each player by adding a `sources` object and a `consensus` score.
 */
function enrich(players, { sleeper, fantasyPros }) {
  const poolSize = players.length || 300;

  for (const p of players) {
    const eid = p.espn_id;
    const sl = sleeper[eid];
    const fp = fantasyPros[eid];

    // Build sources breakdown
    p.sources = {
      espn: {
        adp: p.adp,
        rank: p.espnRank,
        projPts: p.projected_points,
      },
      sleeper: sl
        ? { adp: sl.adp, projPts: sl.pts }
        : null,
      fantasyPros: fp
        ? { ecr: fp.ecr, best: fp.best, worst: fp.worst, avg: fp.avg, tier: fp.tier, posRank: fp.posRank }
        : null,
    };

    // --- Consensus score ---
    // Collect available rank signals, normalize each to 0–100, then average.
    // This is a simple equal-weight consensus; the Advanced sliders still
    // control the separate ADP/Projection/Scarcity blend in rankingEngine.
    const signals = [];

    // ESPN rank (from their expert panel)
    if (p.espnRank) signals.push({ name: 'espnRank', score: rankToScore(p.espnRank, poolSize) });

    // ESPN ADP (lower ADP = drafted earlier = better)
    if (p.adp) signals.push({ name: 'espnAdp', score: rankToScore(Math.round(p.adp), poolSize) });

    // Sleeper ADP
    if (sl?.adp) signals.push({ name: 'sleeperAdp', score: rankToScore(Math.round(sl.adp), poolSize) });

    // FantasyPros ECR
    if (fp?.ecr) signals.push({ name: 'fpEcr', score: rankToScore(fp.ecr, poolSize) });

    // Projection-based signal: normalize projected points to 0–100 relative to the pool max.
    // (Done externally by the caller since we need the full pool to find max.)

    if (signals.length > 0) {
      p.consensus = Math.round((signals.reduce((s, x) => s + x.score, 0) / signals.length) * 10) / 10;
      p.signalCount = signals.length;
    } else {
      p.consensus = null;
      p.signalCount = 0;
    }
  }

  // Sort by consensus desc, then by ESPN rank as tiebreaker
  players.sort((a, b) => {
    if (a.consensus != null && b.consensus != null) return b.consensus - a.consensus;
    if (a.consensus != null) return -1;
    if (b.consensus != null) return 1;
    return (a.espnRank || 999) - (b.espnRank || 999);
  });

  // Assign consensus rank
  players.forEach((p, i) => {
    p.consensusRank = i + 1;
  });

  return players;
}

module.exports = { fetchAll, enrich };
