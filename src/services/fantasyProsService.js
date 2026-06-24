/**
 * FantasyPros Expert Consensus Rankings (ECR).
 * Scrapes the embedded ecrData JSON from the public PPR cheatsheet page.
 * Personal-use, read-only. Keyed by ESPN id via crosswalk.
 */

const https = require('https');
const crosswalk = require('./crosswalk');

const ECR_URL = 'https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(fetchPage(res.headers.location));
          }
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => resolve(Buffer.concat(chunks).toString()));
          res.on('error', reject);
        }
      )
      .on('error', reject);
  });
}

async function fetchECR() {
  await crosswalk.load();

  const html = await fetchPage(ECR_URL);

  const marker = 'ecrData = {';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('ecrData not found on FantasyPros page');

  // Parse JSON starting at the opening brace
  let depth = 0;
  let inString = false;
  let escape = false;
  let jsonEnd = -1;
  const jsonStart = start + marker.length - 1; // position of '{'

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (depth === 0) { jsonEnd = i + 1; break; }
  }

  if (jsonEnd === -1) throw new Error('Could not find end of ecrData JSON');

  const data = JSON.parse(html.slice(jsonStart, jsonEnd));
  const players = data.players || [];

  const result = {};
  let matched = 0;

  for (const p of players) {
    const fpId = String(p.player_id || '');
    const espnId = crosswalk.fpToEspn(fpId);

    // Fallback: try name+team match
    const resolvedEspn = espnId || crosswalk.nameToEspn(p.player_name, p.player_team_id);
    if (!resolvedEspn) continue;

    matched++;
    result[resolvedEspn] = {
      ecr: p.rank_ecr,
      best: p.rank_min,
      worst: p.rank_max,
      avg: p.rank_ave != null ? Math.round(p.rank_ave * 100) / 100 : null,
      tier: p.tier,
      posRank: p.pos_rank,
      std: p.rank_std != null ? Math.round(p.rank_std * 100) / 100 : null,
    };
  }

  console.log(`[fantasyPros] parsed ${players.length} ECR rankings, matched ${matched} to ESPN ids`);
  return result;
}

module.exports = { fetchECR };
