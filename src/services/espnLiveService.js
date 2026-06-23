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

/**
 * Extract season-long projected fantasy points (statSourceId 1 = projection).
 */
function extractProjection(player) {
  const stats = player.stats || [];
  const proj = stats.find((s) => s.statSourceId === 1 && s.statSplitTypeId === 0);
  return proj && typeof proj.appliedTotal === 'number'
    ? Math.round(proj.appliedTotal * 10) / 10
    : undefined;
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

    players.push({
      id: p.id,
      espn_id: String(p.id),
      name: p.fullName,
      position,
      team: team.abbrev || 'FA',
      nfl_team: team.abbrev || 'FA',
      bye_week: team.byeWeek || null,
      adp: adp && adp > 0 ? Math.round(adp * 10) / 10 : null,
      projected_points: extractProjection(p),
      imageUrl: isDST ? teamLogo(team.abbrev) : headshot(p.id),
    });
  });

  return players;
}

module.exports = { fetchPlayers, fetchProTeams, DEFAULT_SEASON, POSITION_MAP };
