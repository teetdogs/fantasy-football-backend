/**
 * Grading engine — scores a user's draft picks against the consensus pool.
 *
 * Produces an A–F letter grade overall and per position, plus a plain-English
 * summary highlighting strengths and weaknesses.
 */

const ROSTER_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

const GRADE_THRESHOLDS = [
  { min: 90, letter: 'A+', color: '#34d399' },
  { min: 85, letter: 'A', color: '#34d399' },
  { min: 80, letter: 'A-', color: '#34d399' },
  { min: 75, letter: 'B+', color: '#57a6ff' },
  { min: 70, letter: 'B', color: '#57a6ff' },
  { min: 65, letter: 'B-', color: '#57a6ff' },
  { min: 60, letter: 'C+', color: '#f6a23c' },
  { min: 55, letter: 'C', color: '#f6a23c' },
  { min: 50, letter: 'C-', color: '#f6a23c' },
  { min: 40, letter: 'D', color: '#ef5d6f' },
  { min: 0, letter: 'F', color: '#ef5d6f' },
];

function toLetter(score) {
  return GRADE_THRESHOLDS.find((t) => score >= t.min) || GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
}

/**
 * Score a single pick: how good is this player relative to what was available
 * at that draft position? Returns 0–100.
 *
 * - Picking the consensus #1 player at pick 1 = 100
 * - Picking consensus #50 at pick 1 = low score (reach)
 * - Picking consensus #1 at pick 20 = high score (steal)
 */
function pickScore(player, pickNumber, poolSize = 300) {
  const rank = player.consensusRank || player.rank || poolSize;
  // Value = how much earlier you got them vs. their consensus rank.
  // If rank > pickNumber, you reached. If rank < pickNumber, it's a steal.
  const valueDelta = rank - pickNumber;
  // Normalize: picking at exact consensus = 70. Each spot of value adds ~1.5, each reach loses ~2.
  const base = 70;
  const score = base + (valueDelta > 0 ? valueDelta * 1.5 : valueDelta * 2);
  return Math.max(0, Math.min(100, score));
}

/**
 * Grade an array of picked players.
 * @param {Array} picks - Array of player objects (from the pool), in draft order.
 * @param {Array} pool - Full player pool for context.
 * @returns {Object} { overall, positions, picks, summary }
 */
function grade(picks, pool) {
  if (!picks.length) {
    return {
      overall: { score: 0, ...toLetter(0) },
      positions: {},
      picks: [],
      summary: 'No players selected yet.',
    };
  }

  const poolSize = pool.length || 300;

  // Score each pick
  const scoredPicks = picks.map((player, i) => {
    const pickNum = i + 1;
    const score = pickScore(player, pickNum, poolSize);
    const rank = player.consensusRank || player.rank || poolSize;
    const delta = rank - pickNum;
    let tag = 'Fair';
    if (delta >= 10) tag = 'Great value';
    else if (delta >= 5) tag = 'Good value';
    else if (delta <= -10) tag = 'Big reach';
    else if (delta <= -5) tag = 'Reach';

    return {
      pickNum,
      playerId: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      consensusRank: rank,
      score,
      delta,
      tag,
    };
  });

  // Overall score = average of pick scores
  const overallScore = Math.round(scoredPicks.reduce((s, p) => s + p.score, 0) / scoredPicks.length);

  // Per-position grades
  const posGroups = {};
  for (const pick of scoredPicks) {
    const pos = pick.position;
    if (!posGroups[pos]) posGroups[pos] = [];
    posGroups[pos].push(pick);
  }

  const positions = {};
  for (const [pos, group] of Object.entries(posGroups)) {
    const avg = Math.round(group.reduce((s, p) => s + p.score, 0) / group.length);
    positions[pos] = { score: avg, ...toLetter(avg), count: group.length };
  }

  // Build summary
  const sorted = Object.entries(positions).sort((a, b) => b[1].score - a[1].score);
  const strengths = sorted.filter(([, v]) => v.score >= 75).map(([k]) => k);
  const weaknesses = sorted.filter(([, v]) => v.score < 60).map(([k]) => k);

  let summary = '';
  if (strengths.length) summary += `Strong at ${strengths.join(', ')}. `;
  if (weaknesses.length) summary += `Weak at ${weaknesses.join(', ')} depth. `;
  const steals = scoredPicks.filter((p) => p.delta >= 10);
  const reaches = scoredPicks.filter((p) => p.delta <= -10);
  if (steals.length) summary += `${steals.length} steal${steals.length > 1 ? 's' : ''} (${steals.map((p) => p.name).join(', ')}). `;
  if (reaches.length) summary += `${reaches.length} reach${reaches.length > 1 ? 'es' : ''} (${reaches.map((p) => p.name).join(', ')}). `;
  if (!summary) summary = 'Solid, balanced draft.';

  return {
    overall: { score: overallScore, ...toLetter(overallScore) },
    positions,
    picks: scoredPicks,
    summary: summary.trim(),
  };
}

/**
 * Simulate other teams' picks in a snake draft (simple: they pick by consensus).
 * @param {number} yourSlot - 1-indexed draft position (1–12)
 * @param {number} numTeams - Total teams in the league
 * @param {number} numRounds - Rounds to simulate
 * @param {Array} yourPicks - Player IDs you've already picked (in order)
 * @param {Array} pool - Full player pool sorted by consensus
 * @returns {Object} { rounds, available, yourNextPick }
 */
function simulateDraft(yourSlot, numTeams, numRounds, yourPicks, pool) {
  const taken = new Set(yourPicks);
  const available = pool.filter((p) => !taken.has(p.id));
  const rounds = [];
  let avIdx = 0;

  for (let round = 1; round <= numRounds; round++) {
    const roundPicks = [];
    const isSnakeReverse = round % 2 === 0;

    for (let slot = 1; slot <= numTeams; slot++) {
      const actualSlot = isSnakeReverse ? numTeams - slot + 1 : slot;
      const isYou = actualSlot === yourSlot;

      if (isYou) {
        // Find which of your picks corresponds to this round
        const yourPickIdx = rounds.filter((r) => r.some((p) => p.isYou)).length;
        const yourPlayer = yourPicks[yourPickIdx]
          ? pool.find((p) => p.id === yourPicks[yourPickIdx])
          : null;

        roundPicks.push({
          slot: actualSlot,
          isYou: true,
          player: yourPlayer || null,
          pickOverall: (round - 1) * numTeams + slot,
        });
        if (yourPlayer) taken.add(yourPlayer.id);
      } else {
        // AI picks best available
        while (avIdx < available.length && taken.has(available[avIdx].id)) avIdx++;
        const pick = available[avIdx] || null;
        if (pick) taken.add(pick.id);
        avIdx++;
        roundPicks.push({
          slot: actualSlot,
          isYou: false,
          player: pick,
          pickOverall: (round - 1) * numTeams + slot,
        });
      }
    }
    rounds.push(roundPicks);
  }

  // Next available for user
  const stillAvailable = pool.filter((p) => !taken.has(p.id));

  return { rounds, available: stillAvailable };
}

/**
 * Recommend the best available player for the user's next pick.
 * Considers value vs. ADP, positional need, scarcity, and raw talent.
 *
 * @param {Object} draftState - { yourSlot, numTeams, picks: [{ playerId, teamSlot }] }
 * @param {Array}  pool       - Full player pool sorted by consensus
 * @returns {Object} { recommendations, needs, currentPick, yourNextPick, picksBetween }
 */
function recommend(draftState, pool) {
  const { yourSlot, numTeams, picks } = draftState;
  const totalPicks = picks.length;

  const takenIds = new Set(picks.map((p) => p.playerId));
  const available = pool.filter((p) => !takenIds.has(p.id));

  const yourPlayerIds = picks.filter((p) => p.teamSlot === yourSlot).map((p) => p.playerId);
  const yourPlayers = yourPlayerIds.map((id) => pool.find((p) => p.id === id)).filter(Boolean);

  const posCount = {};
  for (const player of yourPlayers) {
    posCount[player.position] = (posCount[player.position] || 0) + 1;
  }

  const NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };

  const posAvailMap = {};
  for (const pos of Object.keys(NEEDS)) {
    posAvailMap[pos] = available.filter((p) => p.position === pos);
  }

  // Figure out when the user picks next
  const yourRound = yourPlayers.length + 1;
  const isSnakeReverse = yourRound % 2 === 0;
  const yourNextOverall = isSnakeReverse
    ? (yourRound - 1) * numTeams + (numTeams - yourSlot + 1)
    : (yourRound - 1) * numTeams + yourSlot;
  const picksBetween = Math.max(0, yourNextOverall - totalPicks - 1);

  const scored = available.slice(0, 150).map((player) => {
    let score = 0;
    const reasons = [];
    const rank = player.consensusRank || player.rank || 999;
    const pos = player.position;
    const have = posCount[pos] || 0;
    const need = NEEDS[pos] || 0;
    const posAvail = posAvailMap[pos] || [];
    const posRankAmongAvail = posAvail.findIndex((p) => p.id === player.id) + 1;

    // VALUE — how does consensus rank compare to current pick?
    const currentOverall = totalPicks + 1;
    const valueDelta = rank - currentOverall;
    score += Math.min(35, Math.max(0, 17.5 + valueDelta * 0.7));
    if (valueDelta >= 15) reasons.push('Huge value — should be gone');
    else if (valueDelta >= 8) reasons.push('Great value at this pick');
    else if (valueDelta >= 3) reasons.push('Good value');

    // NEED — starter slots still unfilled?
    if (have < need) {
      score += 25 - have * 8;
      reasons.push(have === 0 ? `No ${pos} yet` : `Need another ${pos}`);
    } else if (!['K', 'DEF'].includes(pos) && have < need + 2) {
      score += 5;
    }

    // SCARCITY — position talent drying up?
    if (posRankAmongAvail === 1) {
      score += 15;
      if (posAvail.length <= numTeams) reasons.push(`Best ${pos} left — talent thinning`);
    } else if (posRankAmongAvail <= 3) {
      score += 10;
    } else if (posRankAmongAvail <= 8) {
      score += 5;
    }
    if (picksBetween > 0 && posRankAmongAvail <= Math.ceil(picksBetween / 3)) {
      score += 5;
      reasons.push('Likely gone next round');
    }

    // TALENT — projected fantasy points
    score += Math.min(25, (player.projected_points || 0) / 15);

    // K/DEF penalty early
    if (['K', 'DEF'].includes(pos) && yourPlayers.length < 8) {
      score -= 30;
    }

    return {
      playerId: player.id,
      name: player.name,
      position: pos,
      team: player.team,
      consensusRank: rank,
      projectedPoints: player.projected_points || null,
      adp: player.adp || null,
      score: Math.round(Math.max(0, score)),
      reasons,
      posRank: posRankAmongAvail,
      posAvailable: posAvail.length,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const needs = Object.entries(NEEDS).map(([pos, need]) => ({
    position: pos,
    need,
    have: posCount[pos] || 0,
    filled: (posCount[pos] || 0) >= need,
  }));

  return {
    recommendations: scored.slice(0, 12),
    needs,
    currentPick: totalPicks + 1,
    yourNextPick: yourNextOverall,
    picksBetween,
  };
}

// Position weights for overall grade — premium positions matter more.
const POS_WEIGHT = { QB: 1.0, RB: 1.3, WR: 1.3, TE: 0.9, K: 0.3, DEF: 0.3 };

/**
 * Score a single player's value relative to the positional pool.
 * Returns 0–100 based on where they rank vs. league expectations.
 */
function scorePlayer(player, posPool, numTeams, slotIndex) {
  const poolSize = posPool.length || 1;
  const posIdx = posPool.findIndex((pp) => pp.id === player.id);
  const posRank = posIdx >= 0 ? posIdx + 1 : poolSize;
  const expectedRank = numTeams * (slotIndex + 1);
  const delta = expectedRank - posRank;
  return Math.max(0, Math.min(100, 60 + delta * 2.5));
}

/**
 * Grade a roster's overall strength against the player pool.
 * Scores every player individually, groups by position, includes FLEX.
 *
 * @param {Array} roster   - Array of player objects from the pool
 * @param {Array} pool     - Full player pool for context
 * @param {number} numTeams - League size (used to set expectations)
 * @returns {Object} { overall, positions, players, summary }
 */
function gradeRoster(roster, pool, numTeams = 10) {
  if (!roster.length) {
    return { overall: { score: 0, ...toLetter(0) }, positions: {}, players: [], summary: 'No players on roster.' };
  }

  const posPools = {};
  for (const p of pool) {
    if (!posPools[p.position]) posPools[p.position] = [];
    posPools[p.position].push(p);
  }

  const STARTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DEF: 1 };
  const FLEX_POS = ['RB', 'WR', 'TE'];

  const rosterByPos = {};
  for (const p of roster) {
    if (!rosterByPos[p.position]) rosterByPos[p.position] = [];
    rosterByPos[p.position].push(p);
  }
  for (const pos of Object.keys(rosterByPos)) {
    rosterByPos[pos].sort((a, b) => (a.consensusRank || 999) - (b.consensusRank || 999));
  }

  // Score every player and tag their role (starter / flex / bench)
  const allPlayerGrades = [];
  const usedIds = new Set();

  // First pass: fill starter slots at each position
  for (const [pos, need] of Object.entries(STARTER_NEEDS)) {
    if (pos === 'FLEX') continue;
    const mine = rosterByPos[pos] || [];
    for (let i = 0; i < mine.length; i++) {
      const p = mine[i];
      const posPool = posPools[p.position] || [];
      const score = scorePlayer(p, posPool, numTeams, i);
      const role = i < need ? 'starter' : 'bench';
      if (role === 'starter') usedIds.add(p.id);
      allPlayerGrades.push({
        playerId: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        consensusRank: p.consensusRank || p.rank || null,
        projectedPoints: p.projected_points ?? null,
        score: Math.round(score),
        ...toLetter(score),
        role,
      });
    }
  }

  // Second pass: assign best remaining RB/WR/TE to FLEX
  const flexCandidates = allPlayerGrades
    .filter((p) => p.role === 'bench' && FLEX_POS.includes(p.position))
    .sort((a, b) => b.score - a.score);
  if (flexCandidates.length > 0) {
    flexCandidates[0].role = 'flex';
    usedIds.add(flexCandidates[0].playerId);
  }

  // Position-level grades (starters + flex only for scoring)
  const positions = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const pos of Object.keys(STARTER_NEEDS)) {
    let posPlayers;
    if (pos === 'FLEX') {
      posPlayers = allPlayerGrades.filter((p) => p.role === 'flex');
    } else {
      posPlayers = allPlayerGrades.filter((p) => p.position === pos && p.role === 'starter');
    }

    const allAtPos = allPlayerGrades.filter((p) => p.position === pos || (pos === 'FLEX' && p.role === 'flex'));

    if (!posPlayers.length && pos !== 'FLEX') {
      positions[pos] = { score: 0, ...toLetter(0), count: 0, players: [], depth: 'empty' };
      continue;
    }
    if (!posPlayers.length) continue;

    const avgScore = Math.round(posPlayers.reduce((s, p) => s + p.score, 0) / posPlayers.length);

    const totalAtPos = pos === 'FLEX' ? 1 : (rosterByPos[pos] || []).length;
    const need = STARTER_NEEDS[pos] || 1;
    let depth = 'thin';
    if (totalAtPos - need >= 2) depth = 'deep';
    else if (totalAtPos - need >= 1) depth = 'ok';

    const weight = POS_WEIGHT[pos] || (pos === 'FLEX' ? 1.0 : 0.5);
    weightedSum += avgScore * weight;
    totalWeight += weight;

    positions[pos] = {
      score: avgScore,
      ...toLetter(avgScore),
      count: totalAtPos,
      players: allAtPos.map((p) => ({ name: p.name, rank: p.consensusRank, score: p.score, role: p.role })),
      depth,
    };
  }

  const overallScore = Math.round(totalWeight ? weightedSum / totalWeight : 0);

  const sorted = Object.entries(positions).sort((a, b) => b[1].score - a[1].score);
  const strengths = sorted.filter(([, v]) => v.score >= 75).map(([k]) => k);
  const weaknesses = sorted.filter(([, v]) => v.score > 0 && v.score < 55).map(([k]) => k);
  const thinSpots = sorted.filter(([, v]) => v.depth === 'thin' && v.count > 0).map(([k]) => k);

  let summary = '';
  if (strengths.length) summary += `Strong at ${strengths.join(', ')}. `;
  if (weaknesses.length) summary += `Needs improvement at ${weaknesses.join(', ')}. `;
  if (thinSpots.length) summary += `Thin depth at ${thinSpots.join(', ')} — watch waivers. `;
  if (!summary) summary = 'Balanced roster across positions.';

  return {
    overall: { score: overallScore, ...toLetter(overallScore) },
    positions,
    players: allPlayerGrades,
    summary: summary.trim(),
  };
}

// ——— Trade valuation model ———
// Base scarcity multipliers (1-QB PPR default; moderate so they nudge, not
// distort). League context shifts these — see leagueScarcity().
const BASE_SCARCITY = { QB: 0.92, RB: 1.12, WR: 1.0, TE: 1.10, K: 0.78, DEF: 0.78 };

// Replacement-level rank per position at a 12-team baseline. Scaled by league
// size and superflex in leagueReplacement().
const BASE_REPLACEMENT_RANK = { QB: 14, RB: 32, WR: 38, TE: 14, K: 14, DEF: 14 };

// Each extra player in a package is discounted — roster spots are finite and
// you can't start everyone, so consolidating into fewer studs has real value.
const CONSOLIDATION_PENALTY = 0.08;

/**
 * Position scarcity multipliers adjusted for league context.
 * ctx: { scoringFormat, superflex, teReceptionPremium }
 */
function leagueScarcity(ctx = {}) {
  const m = { ...BASE_SCARCITY };
  const fmt = String(ctx.scoringFormat || 'PPR');
  if (/standard/i.test(fmt)) {
    m.RB = 1.20; m.WR = 0.92; m.TE = 1.05;        // no PPR → RB-heavy
  } else if (/half/i.test(fmt)) {
    m.RB = 1.14; m.WR = 0.98; m.TE = 1.08;
  } else {
    m.RB = 1.08; m.WR = 1.03; m.TE = 1.12;        // full PPR lifts pass-catchers
  }
  if (ctx.superflex) m.QB = 1.35;                  // QBs become premium assets
  if (ctx.teReceptionPremium) m.TE += 0.12;
  return m;
}

/** Replacement ranks scaled by league size + superflex. */
function leagueReplacement(ctx = {}) {
  const factor = (ctx.numTeams || 12) / 12;
  const r = {};
  for (const [pos, base] of Object.entries(BASE_REPLACEMENT_RANK)) {
    r[pos] = Math.max(5, Math.round(base * factor));
  }
  if (ctx.superflex) r.QB = Math.round(r.QB * 1.8); // far more QBs get started
  return r;
}

/**
 * Build a trade valuer bound to a player pool + league context.
 * Value blends rank percentile with Value-Over-Replacement, then applies a
 * league-aware positional scarcity multiplier. Shared by analyzeTrade +
 * trade suggestions.
 */
function makeTradeValuer(pool, ctx = {}) {
  const poolSize = pool.length || 300;
  const scarcity = leagueScarcity(ctx);
  const replacementRank = leagueReplacement(ctx);

  // Per-position projection baselines for VOR.
  const byPos = {};
  for (const p of pool) {
    (byPos[p.position] = byPos[p.position] || []).push(p);
  }
  const baseline = {};
  for (const [pos, arr] of Object.entries(byPos)) {
    arr.sort((a, b) => (b.projected_points || 0) - (a.projected_points || 0));
    const idx = Math.min(replacementRank[pos] || 14, arr.length - 1);
    baseline[pos] = arr[idx]?.projected_points || 0;
  }

  return function value(p) {
    if (!p) return null;
    const rank = p.consensusRank || p.rank || poolSize;
    const proj = p.projected_points || 0;
    const scar = scarcity[p.position] || 1;

    // Rank percentile: always available, anchors the value.
    const rankScore = Math.max(0, 100 - (rank / poolSize) * 100);
    // VOR: points above replacement at the position (≈0–200), scaled to ~0–100.
    const vor = Math.max(0, proj - (baseline[p.position] || 0));
    const vorScore = Math.min(100, vor / 1.8);

    const blended = rankScore * 0.55 + vorScore * 0.45;
    const val = Math.round(blended * scar);

    return {
      player: { id: p.id, name: p.name, position: p.position, team: p.team, consensusRank: rank, projectedPoints: proj },
      value: val,
      rankScore: Math.round(rankScore),
      vor: Math.round(vor),
      scarcity: scar,
    };
  };
}

// Discount a package's raw value for extra players (consolidation premium).
function packageValue(valued) {
  const raw = valued.reduce((s, v) => s + v.value, 0);
  const discount = Math.max(0.6, 1 - CONSOLIDATION_PENALTY * Math.max(0, valued.length - 1));
  return { raw, adjusted: Math.round(raw * discount), discount };
}

/** Human-readable summary of the league context the trade was valued under. */
function describeContext(ctx = {}) {
  const parts = [];
  if (ctx.numTeams) parts.push(`${ctx.numTeams}-team`);
  parts.push(String(ctx.scoringFormat || 'PPR'));
  if (ctx.superflex) parts.push('Superflex');
  if (ctx.teReceptionPremium) parts.push('TE-premium');
  return parts.join(' ');
}

/**
 * Analyze a trade using VOR + positional scarcity + consolidation adjustment.
 * @param {number[]} givingIds, gettingIds - player IDs
 * @param {Array} pool - full player pool
 * @param {Object} ctx - league context { scoringFormat, superflex, numTeams, teReceptionPremium }
 */
function analyzeTrade(givingIds, gettingIds, pool, ctx = {}) {
  const playerMap = new Map(pool.map((p) => [p.id, p]));
  const valuer = makeTradeValuer(pool, ctx);

  const giving = givingIds.map((id) => valuer(playerMap.get(id))).filter(Boolean);
  const getting = gettingIds.map((id) => valuer(playerMap.get(id))).filter(Boolean);

  const givePkg = packageValue(giving);
  const getPkg = packageValue(getting);
  const differential = getPkg.adjusted - givePkg.adjusted;

  // Scale-relative verdict so multi-player deals judge fairly.
  const ref = Math.max(givePkg.adjusted, getPkg.adjusted, 1);
  const pct = differential / ref;

  let verdict;
  if (Math.abs(pct) < 0.07) verdict = 'Fair trade';
  else if (pct >= 0.35) verdict = 'Big win for you';
  else if (pct >= 0.18) verdict = 'You win this trade';
  else if (pct > 0) verdict = 'Slight edge for you';
  else if (pct <= -0.35) verdict = 'Lopsided — you lose big';
  else if (pct <= -0.18) verdict = 'They win this trade';
  else verdict = 'Slight edge for them';

  // Contextual notes explaining the weighting.
  const notes = [];
  if (giving.length !== getting.length) {
    const more = giving.length > getting.length ? 'give' : 'get';
    notes.push(`You ${more} more players — packages are discounted ${Math.round(CONSOLIDATION_PENALTY * 100)}% per extra player since you can only start so many.`);
  }
  const scarceGet = getting.find((g) => g.scarcity > 1.05 && g.value >= 50);
  if (scarceGet) notes.push(`${scarceGet.player.name} carries a positional-scarcity premium (${scarceGet.player.position}).`);

  return {
    giving: { players: giving, totalValue: givePkg.adjusted, rawValue: givePkg.raw },
    getting: { players: getting, totalValue: getPkg.adjusted, rawValue: getPkg.raw },
    differential,
    verdict,
    notes,
    context: describeContext(ctx),
  };
}

module.exports = { grade, simulateDraft, recommend, gradeRoster, analyzeTrade, makeTradeValuer, toLetter, ROSTER_SLOTS };
