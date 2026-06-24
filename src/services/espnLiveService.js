/**
 * ESPN Live Service — pulls real projections, ADP, and player info from ESPN's
 * public fantasy read API (no auth/key required).
 *
 * Endpoint: lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}
 * Player query is controlled via the `x-fantasy-filter` request header.
 */

const HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const DEFAULT_SEASON = parseInt(process.env.SEASON || '2026', 10);

// ESPN defaultPositionId -> our position label
const POSITION_MAP = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DEF',
};

const headshot = (espnId) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;

const teamLogo = (abbrev) =>
  `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbrev || 'nfl').toLowerCase()}.png`;

async function espnGet(url, filter) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
  if (filter) headers['x-fantasy-filter'] = JSON.stringify(filter);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`ESPN ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

/**
 * Map of proTeamId -> { abbrev, byeWeek } for the given season.
 */
async function fetchProTeams(season = DEFAULT_SEASON) {
  const data = await espnGet(`${HOST}/${season}?view=proTeamSchedules_wl`);
  const teams = data?.settings?.proTeams || [];
  const map = {};
  teams.forEach((t) => {
    map[t.id] = { abbrev: t.abbrev, byeWeek: t.byeWeek };
  });
  return map;
}

// ESPN stat id -> our projected stat-line key (verified by magnitude against
// known players, e.g. Bijan: 24=rushYds 1443, 23=car 307, 53=rec, 42=recYds).
const PROJ_STAT_MAP = {
  0: 'att',
  1: 'comp',
  3: 'passYds',
  4: 'passTd',
  20: 'int',
  23: 'car',
  24: 'rushYds',
  25: 'rushTd',
  42: 'recYds',
  43: 'recTd',
  53: 'rec',
  58: 'tgt',
};

/**
 * Extract the season-long projection (statSourceId 1 = projection): the total
 * fantasy points plus a position-relevant projected stat line.
 */
function extractProjection(player) {
  const stats = player.stats || [];
  const proj = stats.find((s) => s.statSourceId === 1 && s.statSplitTypeId === 0);
  if (!proj) return null;

  const line = {};
  const raw = proj.stats || {};
  Object.entries(PROJ_STAT_MAP).forEach(([id, key]) => {
    if (raw[id] != null) line[key] = Math.round(Number(raw[id]));
  });

  return {
    fpts: typeof proj.appliedTotal === 'number' ? Math.round(proj.appliedTotal * 10) / 10 : null,
    ...line,
  };
}

/**
 * Fetch the top N players for the season, mapped to our internal Player shape.
 */
async function fetchPlayers({ season = DEFAULT_SEASON, limit = 300 } = {}) {
  const proTeams = await fetchProTeams(season);

  const filter = {
    players: {
      limit,
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: 'PPR' },
    },
  };

  const data = await espnGet(
    `${HOST}/${season}/segments/0/leaguedefaults/3?view=kona_player_info`,
    filter
  );

  const rows = data?.players || [];
  const players = [];

  rows.forEach((entry) => {
    const p = entry.player;
    if (!p) return;

    const position = POSITION_MAP[p.defaultPositionId];
    if (!position) return; // skip non-fantasy / unsupported slots

    const team = proTeams[p.proTeamId] || {};
    const adp = p.ownership?.averageDraftPosition;
    const isDST = position === 'DEF';
    const projection = extractProjection(p);

    // ESPN expert rank (PPR)
    const rankEntries = (p.rankings && p.rankings['0']) || [];
    const pprRank = rankEntries.find((r) => r.rankType === 'PPR');

    players.push({
      id: p.id,
      espn_id: String(p.id),
      name: p.fullName,
      position,
      team: team.abbrev || 'FA',
      nfl_team: team.abbrev || 'FA',
      bye_week: team.byeWeek || null,
      adp: adp && adp > 0 ? Math.round(adp * 10) / 10 : null,
      projected_points: projection ? projection.fpts : undefined,
      projection,
      imageUrl: isDST ? teamLogo(team.abbrev) : headshot(p.id),
      injuryStatus: p.injuryStatus || 'ACTIVE',
      seasonOutlook: p.seasonOutlook || null,
      espnRank: pprRank ? pprRank.rank : null,
    });
  });

  return players;
}

module.exports = { fetchPlayers, fetchProTeams, DEFAULT_SEASON, POSITION_MAP };
