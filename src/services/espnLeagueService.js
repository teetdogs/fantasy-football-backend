/**
 * ESPN League Service — fetches a user's private league data using their
 * SWID + espn_s2 cookies and league ID.
 *
 * Endpoint: lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
 */

const { DEFAULT_SEASON } = require('./espnLiveService');

const HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';

async function leagueGet(leagueId, season, swid, espnS2, views) {
  const params = views.map((v) => `view=${v}`).join('&');
  const url = `${HOST}/${season}/segments/0/leagues/${leagueId}?${params}`;

  const res = await fetch(url, {
    headers: {
      Cookie: `SWID=${swid}; espn_s2=${espnS2}`,
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Invalid or expired ESPN credentials. Re-copy your cookies from espn.com.'), { status: 401 });
  }
  if (res.status === 404) {
    throw Object.assign(new Error('League not found. Double-check your league ID.'), { status: 404 });
  }
  if (!res.ok) {
    throw new Error(`ESPN returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const SLOT_MAP = {
  0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'DEF', 17: 'K',
  20: 'Bench', 21: 'IR', 23: 'FLEX',
};

function parseRosterSlots(settings) {
  const lineupSlotCounts = settings?.rosterSettings?.lineupSlotCounts || {};
  const slots = [];
  for (const [slotId, count] of Object.entries(lineupSlotCounts)) {
    const label = SLOT_MAP[slotId];
    if (label && count > 0 && label !== 'IR') {
      slots.push({ position: label, count });
    }
  }
  return slots;
}

const SCORING_STAT_MAP = {
  3: 'passYds', 4: 'passTd', 20: 'int',
  24: 'rushYds', 25: 'rushTd',
  42: 'recYds', 43: 'recTd', 53: 'rec',
};

function parseScoringRules(settings) {
  const items = settings?.scoringSettings?.scoringItems || [];
  const rules = {};
  for (const item of items) {
    const label = SCORING_STAT_MAP[item.statId];
    if (label && item.pointsOverrides) {
      rules[label] = Object.values(item.pointsOverrides)[0];
    } else if (label) {
      rules[label] = item.points;
    }
  }
  return rules;
}

function parseScoringFormat(scoring) {
  const ppr = scoring.rec || 0;
  if (ppr === 1) return 'PPR';
  if (ppr === 0.5) return 'Half-PPR';
  return 'Standard';
}

/**
 * Fetch league settings: name, size, roster slots, scoring rules, draft info.
 */
async function fetchLeagueSettings(leagueId, swid, espnS2, season = DEFAULT_SEASON) {
  const data = await leagueGet(leagueId, season, swid, espnS2, ['mSettings']);

  const s = data.settings || {};
  const rosterSlots = parseRosterSlots(s);
  const scoring = parseScoringRules(s);
  const format = parseScoringFormat(scoring);

  const draftSettings = s.draftSettings || {};

  return {
    leagueId: data.id,
    name: s.name,
    size: s.size,
    season,
    isPublic: s.isPublic || false,
    rosterSlots,
    scoring,
    scoringFormat: format,
    draft: {
      type: draftSettings.type === 'SNAKE' ? 'Snake' : draftSettings.type || 'Unknown',
      date: draftSettings.date ? new Date(draftSettings.date).toISOString() : null,
      rounds: draftSettings.pickOrder?.length || rosterSlots.reduce((s, r) => s + r.count, 0),
    },
  };
}

/**
 * Fetch teams in the league with basic roster info.
 */
async function fetchLeagueTeams(leagueId, swid, espnS2, season = DEFAULT_SEASON) {
  const data = await leagueGet(leagueId, season, swid, espnS2, ['mTeam']);

  const members = new Map((data.members || []).map((m) => [m.id, m]));

  return (data.teams || []).map((t) => {
    const owner = members.get(t.primaryOwner);
    return {
      teamId: t.id,
      name: `${t.location || ''} ${t.nickname || ''}`.trim() || `Team ${t.id}`,
      abbrev: t.abbrev,
      owner: owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Unknown',
      record: t.record?.overall
        ? { wins: t.record.overall.wins, losses: t.record.overall.losses, ties: t.record.overall.ties }
        : null,
      draftPosition: t.draftDayProjectedRank || null,
    };
  });
}

/**
 * Fetch draft results (picks already made).
 */
async function fetchDraftResults(leagueId, swid, espnS2, season = DEFAULT_SEASON) {
  const data = await leagueGet(leagueId, season, swid, espnS2, ['mDraftDetail']);

  const picks = (data.draftDetail?.picks || []).map((p) => ({
    round: p.roundId,
    pick: p.roundPickNumber,
    overall: p.overallPickNumber,
    teamId: p.teamId,
    playerId: p.playerId,
    keeper: p.keeper || false,
  }));

  return {
    drafted: data.draftDetail?.drafted || false,
    picks,
  };
}

/**
 * Quick connectivity check — validates credentials + league access.
 */
async function testConnection(leagueId, swid, espnS2, season = DEFAULT_SEASON) {
  const settings = await fetchLeagueSettings(leagueId, swid, espnS2, season);
  return { ok: true, leagueName: settings.name, size: settings.size, format: settings.scoringFormat };
}

module.exports = {
  fetchLeagueSettings,
  fetchLeagueTeams,
  fetchDraftResults,
  testConnection,
};
