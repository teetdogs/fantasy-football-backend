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
 * Grade a roster's overall strength against the player pool.
 * Unlike the draft grader (which scores value vs. pick slot), this scores
 * absolute quality: where do your players rank in the full pool?
 *
 * @param {Array} roster   - Array of player objects from the pool
 * @param {Array} pool     - Full player pool for context
 * @param {number} numTeams - League size (used to set expectations)
 * @returns {Object} { overall, positions, starters, summary }
 */
function gradeRoster(roster, pool, numTeams = 10) {
  if (!roster.length) {
    return { overall: { score: 0, ...toLetter(0) }, positions: {}, starters: [], summary: 'No players on roster.' };
  }

  // Build positional pools for percentile comparison
  const posPools = {};
  for (const p of pool) {
    if (!posPools[p.position]) posPools[p.position] = [];
    posPools[p.position].push(p);
  }

  // Expected rank for a "league average" starter at each position:
  // In a 10-team league, the average starting QB is roughly QB10.
  const STARTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };

  // Group roster by position
  const rosterByPos = {};
  for (const p of roster) {
    if (!rosterByPos[p.position]) rosterByPos[p.position] = [];
    rosterByPos[p.position].push(p);
  }

  // Score each position group
  const positions = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [pos, need] of Object.entries(STARTER_NEEDS)) {
    const mine = (rosterByPos[pos] || [])
      .slice()
      .sort((a, b) => (a.consensusRank || 999) - (b.consensusRank || 999));
    const posPool = posPools[pos] || [];
    const poolSize = posPool.length || 1;

    if (!mine.length) {
      positions[pos] = { score: 0, ...toLetter(0), count: 0, topPlayer: null, depth: 'empty' };
      continue;
    }

    // Score starters by percentile within the position pool.
    // Being QB1 in a pool of 30 QBs = 100th percentile.
    const starters = mine.slice(0, need);
    const starterScores = starters.map((p) => {
      const rank = p.consensusRank || p.rank || poolSize;
      const posIdx = posPool.findIndex((pp) => pp.id === p.id);
      const posRank = posIdx >= 0 ? posIdx + 1 : poolSize;
      // Expected rank = numTeams * slot (e.g., RB1 expected around numTeams*1)
      // Being better than expected = bonus, worse = penalty
      const expectedRank = numTeams * (starters.indexOf(p) + 1);
      const delta = expectedRank - posRank;
      return Math.max(0, Math.min(100, 60 + delta * 2.5));
    });

    const avgScore = Math.round(starterScores.reduce((s, v) => s + v, 0) / starterScores.length);

    // Depth bonus: having quality backups
    const benchPlayers = mine.slice(need);
    let depth = 'thin';
    if (benchPlayers.length >= 2) depth = 'deep';
    else if (benchPlayers.length >= 1) depth = 'ok';

    const topPlayer = mine[0];
    const weight = POS_WEIGHT[pos] || 1;
    weightedSum += avgScore * weight;
    totalWeight += weight;

    positions[pos] = {
      score: avgScore,
      ...toLetter(avgScore),
      count: mine.length,
      topPlayer: topPlayer ? { name: topPlayer.name, rank: topPlayer.consensusRank || topPlayer.rank } : null,
      depth,
    };
  }

  const overallScore = Math.round(totalWeight ? weightedSum / totalWeight : 0);

  // Build summary
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
    summary: summary.trim(),
  };
}

module.exports = { grade, simulateDraft, recommend, gradeRoster, toLetter, ROSTER_SLOTS };
