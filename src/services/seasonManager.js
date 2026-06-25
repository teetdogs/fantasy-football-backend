/**
 * Season Manager — turns raw ESPN roster + free-agent data into actionable
 * advice: an enriched view of your team, waiver-wire upgrades, and drop
 * candidates. All player ranking/value comes from our own consensus pool.
 */

const leagueService = require('./espnLeagueService');
const playerStore = require('./playerStore');
const { gradeRoster } = require('./gradingEngine');

// How many starters each position typically needs — used to decide whether a
// roster spot is "thin" and worth upgrading via waivers.
const STARTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };

/**
 * Enrich an ESPN player id with our pool data. Returns null if we don't track
 * the player (deep waiver guys outside our top pool).
 */
function enrich(playerId, playerMap) {
  const p = playerMap.get(playerId);
  if (!p) return null;
  return {
    playerId,
    name: p.name,
    position: p.position,
    team: p.team,
    consensusRank: p.consensusRank || p.rank || null,
    projectedPoints: p.projected_points ?? null,
    byeWeek: p.bye_week ?? null,
    injuryStatus: p.injuryStatus || null,
  };
}

/**
 * Build the full Season Manager payload for one team.
 * @returns { roster, waivers, drops }
 */
async function buildMyTeam({ leagueId, swid, espnS2, teamId }) {
  const [rosters, freeAgents, pool] = await Promise.all([
    leagueService.fetchAllRosters(leagueId, swid, espnS2),
    leagueService.fetchFreeAgents(leagueId, swid, espnS2),
    playerStore.getPlayers(),
  ]);

  const playerMap = new Map(pool.map((p) => [p.id, p]));
  const myEntries = rosters[teamId] || [];

  // --- My roster, enriched and grouped by position ---
  const roster = myEntries
    .map((e) => {
      const player = enrich(e.playerId, playerMap);
      if (!player) {
        return { playerId: e.playerId, name: `ESPN #${e.playerId}`, position: '??', team: '', consensusRank: null, projectedPoints: null, byeWeek: null, injuryStatus: null, onBench: e.onBench };
      }
      return { ...player, onBench: e.onBench };
    })
    .sort((a, b) => (a.consensusRank || 9999) - (b.consensusRank || 9999));

  // What do I have at each position? (used for drop/waiver depth logic)
  const myByPosition = {};
  for (const p of roster) {
    if (!myByPosition[p.position]) myByPosition[p.position] = [];
    myByPosition[p.position].push(p);
  }

  // --- Free agents, enriched and ranked by our consensus ---
  const enrichedFreeAgents = freeAgents
    .map((fa) => {
      const player = enrich(fa.playerId, playerMap);
      if (!player) return null; // skip players outside our pool — no ranking to compare
      return { ...player, percentOwned: fa.percentOwned };
    })
    .filter(Boolean)
    .sort((a, b) => (a.consensusRank || 9999) - (b.consensusRank || 9999));

  // --- Waiver suggestions: a free agent that out-ranks my weakest player at
  //     that position (or fills a position where I'm below starter needs). ---
  const waivers = [];
  for (const fa of enrichedFreeAgents) {
    const mine = (myByPosition[fa.position] || []).slice().sort(
      (a, b) => (a.consensusRank || 9999) - (b.consensusRank || 9999)
    );
    const need = STARTER_NEEDS[fa.position] || 0;
    const myWorstStarter = mine[need - 1]; // the last starter-quality player I have
    const myWorst = mine[mine.length - 1];

    let reason = null;
    if (mine.length < need) {
      reason = `You're short at ${fa.position} (${mine.length}/${need} starters)`;
    } else if (myWorstStarter && fa.consensusRank && myWorstStarter.consensusRank && fa.consensusRank < myWorstStarter.consensusRank) {
      reason = `Ranks ahead of your ${fa.position}${need} (${myWorstStarter.name})`;
    } else if (myWorst && fa.consensusRank && myWorst.consensusRank && fa.consensusRank < myWorst.consensusRank) {
      reason = `Bench upgrade over ${myWorst.name}`;
    }

    if (reason) {
      waivers.push({ ...fa, reason, replaces: myWorst?.name || null });
    }
    if (waivers.length >= 15) break;
  }

  // --- Drop candidates: my lowest-ranked players, weighted toward depth at
  //     positions where I already have plenty. ---
  const drops = roster
    .filter((p) => p.position !== '??')
    .map((p) => {
      const depth = (myByPosition[p.position] || []).length;
      const need = STARTER_NEEDS[p.position] || 1;
      const surplus = depth > need;
      return { ...p, surplus };
    })
    .sort((a, b) => (b.consensusRank || 0) - (a.consensusRank || 0)) // worst rank first
    .slice(0, 6);

  // Grade the roster — resolve player IDs back to full pool objects for the grader
  const rosterPoolPlayers = myEntries
    .map((e) => playerMap.get(e.playerId))
    .filter(Boolean);
  const numTeams = Object.keys(rosters).length || 10;
  const grade = gradeRoster(rosterPoolPlayers, pool, numTeams);

  return {
    teamId,
    roster,
    waivers,
    drops,
    grade,
    counts: Object.fromEntries(Object.entries(myByPosition).map(([pos, arr]) => [pos, arr.length])),
  };
}

/**
 * Power-rank every team in the league.
 * Runs gradeRoster on each team's roster and returns a sorted leaderboard.
 */
async function leaguePowerRankings({ leagueId, swid, espnS2 }) {
  const [rosters, teams, pool] = await Promise.all([
    leagueService.fetchAllRosters(leagueId, swid, espnS2),
    leagueService.fetchLeagueTeams(leagueId, swid, espnS2),
    playerStore.getPlayers(),
  ]);

  const playerMap = new Map(pool.map((p) => [p.id, p]));
  const numTeams = teams.length || 10;
  const teamMap = new Map(teams.map((t) => [t.teamId, t]));

  const rankings = Object.entries(rosters).map(([teamIdStr, entries]) => {
    const teamId = Number(teamIdStr);
    const rosterPlayers = entries.map((e) => playerMap.get(e.playerId)).filter(Boolean);
    const grade = gradeRoster(rosterPlayers, pool, numTeams);
    const team = teamMap.get(teamId);
    return {
      teamId,
      teamName: team?.name || `Team ${teamId}`,
      owner: team?.owner || 'Unknown',
      overall: grade.overall,
      positions: grade.positions,
      rosterSize: entries.length,
    };
  });

  rankings.sort((a, b) => b.overall.score - a.overall.score);
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return { rankings };
}

module.exports = { buildMyTeam, leaguePowerRankings };
