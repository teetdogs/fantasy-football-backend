/**
 * Sleeper ADP + projections service.
 * Public API, no auth required. Returns PPR ADP and projected points
 * keyed by ESPN id (via crosswalk).
 */

const https = require('https');
const crosswalk = require('./crosswalk');

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const SEASON = process.env.SEASON || new Date().getFullYear();

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function fetchSleeperADP() {
  await crosswalk.load();

  const posQuery = POSITIONS.map((p) => `position=${p}`).join('&');
  const url = `https://api.sleeper.app/projections/nfl/${SEASON}?season_type=regular&${posQuery}`;

  const data = await fetch(url);
  if (!Array.isArray(data)) throw new Error('Sleeper returned non-array');

  const result = {};
  let matched = 0;

  for (const entry of data) {
    const sleeperId = String(entry.player_id || '');
    const stats = entry.stats || {};
    const adp = stats.adp_ppr;
    const pts = stats.pts_ppr;

    if (!sleeperId || adp == null) continue;

    // Try sleeper_id crosswalk first, then fall back to name+team
    const playerInfo = entry.player || {};
    const pName = [playerInfo.first_name, playerInfo.last_name].filter(Boolean).join(' ');
    const pTeam = playerInfo.team_abbr || playerInfo.team || entry.team;
    const espnId = crosswalk.sleeperToEspn(sleeperId) || crosswalk.nameToEspn(pName, pTeam);
    if (!espnId) continue;

    matched++;
    result[espnId] = {
      adp: Math.round(adp * 10) / 10,
      pts: pts != null ? Math.round(pts * 10) / 10 : null,
      rank: stats.rank_ppr || null,
    };
  }

  console.log(`[sleeper] fetched ${data.length} projections, matched ${matched} to ESPN ids`);
  return result;
}

module.exports = { fetchSleeperADP };
