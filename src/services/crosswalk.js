/**
 * Player ID crosswalk — maps between ESPN, FantasyPros, and Sleeper IDs
 * using the dynastyprocess open dataset. Loaded once at startup.
 */

const https = require('https');
const http = require('http');

const XWALK_URL =
  'https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv';

let loaded = false;
const byEspn = {};     // espn_id -> { fpId, sleeperId, name }
const byFp = {};        // fantasypros_id -> espn_id
const bySleeper = {};   // sleeper_id -> espn_id
const byName = {};      // "lowercase name|team" -> espn_id (fallback)

function followRedirects(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(followRedirects(res.headers.location));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Minimal RFC-4180 CSV row parser. Handles quoted fields with embedded commas
 * and escaped double-quotes (e.g. "Smith, Jr.").
 */
function parseCSVRow(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { val += '"'; i += 2; } // escaped quote
          else { i++; break; } // closing quote
        } else {
          val += line[i++];
        }
      }
      fields.push(val);
      i++; // skip comma
    } else {
      const next = line.indexOf(',', i);
      if (next === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, next));
      i = next + 1;
    }
  }
  return fields;
}

async function load() {
  if (loaded) return;
  const csv = await followRedirects(XWALK_URL);
  const lines = csv.split('\n');
  const header = parseCSVRow(lines[0]);
  const idx = (col) => header.indexOf(col);
  const iEspn = idx('espn_id');
  const iFp = idx('fantasypros_id');
  const iSleeper = idx('sleeper_id');
  const iName = idx('name');
  const iTeam = idx('team');

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVRow(lines[i]);
    const espn = (cols[iEspn] || '').trim();
    const fp = (cols[iFp] || '').trim();
    const sleeper = (cols[iSleeper] || '').trim();
    const name = (cols[iName] || '').trim();
    const team = (cols[iTeam] || '').trim();

    if (!espn || espn === 'NA') continue;

    const entry = {
      espnId: espn,
      fpId: fp && fp !== 'NA' ? fp : null,
      sleeperId: sleeper && sleeper !== 'NA' ? sleeper : null,
      name,
    };

    byEspn[espn] = entry;
    if (entry.fpId) byFp[entry.fpId] = espn;
    if (entry.sleeperId) bySleeper[entry.sleeperId] = espn;
    if (name && team) byName[`${name.toLowerCase()}|${team.toLowerCase()}`] = espn;
  }

  loaded = true;
  console.log(
    `[crosswalk] loaded ${Object.keys(byEspn).length} espn, ${Object.keys(byFp).length} fp, ${Object.keys(bySleeper).length} sleeper mappings`
  );
}

function fpToEspn(fpId) { return byFp[String(fpId)] || null; }
function sleeperToEspn(sleeperId) { return bySleeper[String(sleeperId)] || null; }
function nameToEspn(name, team) {
  return byName[`${name.toLowerCase()}|${(team || '').toLowerCase()}`] || null;
}
function getEntry(espnId) { return byEspn[String(espnId)] || null; }

module.exports = { load, fpToEspn, sleeperToEspn, nameToEspn, getEntry };
