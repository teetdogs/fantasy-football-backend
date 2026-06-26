/**
 * NFL News Service — aggregates headlines from multiple sources.
 * General feed: ESPN (JSON API), NFL.com (RSS), Yahoo Sports (RSS).
 * Team feed: ESPN team news + the team's SB Nation blog (local commentary).
 * Caches results for 10 minutes.
 */

const Parser = require('rss-parser');

// SB Nation (and many feeds) block default/non-browser user agents with a 403,
// so present a browser UA. Verified necessary for the SB Nation team blogs.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const rss = new Parser({ timeout: 8000, headers: { 'User-Agent': BROWSER_UA } });

const ESPN_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const CACHE_TTL = 10 * 60 * 1000;

// ESPN's stable numeric team IDs, keyed by abbreviation (used by ?team={id}).
const ESPN_TEAM_IDS = {
  ATL: 1, BUF: 2, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8,
  GB: 9, TEN: 10, IND: 11, KC: 12, LV: 13, LAR: 14, MIA: 15, MIN: 16,
  NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, ARI: 22, PIT: 23, LAC: 24,
  SF: 25, SEA: 26, TB: 27, WSH: 28, CAR: 29, JAX: 30, BAL: 33, HOU: 34,
};

// Each team's SB Nation blog — local beat-style commentary. Uniform
// /rss/index.xml format. { domain, name } keyed by abbreviation.
const SB_NATION = {
  ARI: { domain: 'revengeofthebirds.com', name: 'Revenge of the Birds' },
  ATL: { domain: 'thefalcoholic.com', name: 'The Falcoholic' },
  BAL: { domain: 'baltimorebeatdown.com', name: 'Baltimore Beatdown' },
  BUF: { domain: 'buffalorumblings.com', name: 'Buffalo Rumblings' },
  CAR: { domain: 'catscratchreader.com', name: 'Cat Scratch Reader' },
  CHI: { domain: 'windycitygridiron.com', name: 'Windy City Gridiron' },
  CIN: { domain: 'cincyjungle.com', name: 'Cincy Jungle' },
  CLE: { domain: 'dawgsbynature.com', name: 'Dawgs By Nature' },
  DAL: { domain: 'bloggingtheboys.com', name: 'Blogging The Boys' },
  DEN: { domain: 'milehighreport.com', name: 'Mile High Report' },
  DET: { domain: 'prideofdetroit.com', name: 'Pride Of Detroit' },
  GB: { domain: 'acmepackingcompany.com', name: 'Acme Packing Company' },
  HOU: { domain: 'battleredblog.com', name: 'Battle Red Blog' },
  IND: { domain: 'stampedeblue.com', name: 'Stampede Blue' },
  JAX: { domain: 'bigcatcountry.com', name: 'Big Cat Country' },
  KC: { domain: 'arrowheadpride.com', name: 'Arrowhead Pride' },
  LV: { domain: 'silverandblackpride.com', name: 'Silver And Black Pride' },
  LAC: { domain: 'boltsfromtheblue.com', name: 'Bolts From The Blue' },
  LAR: { domain: 'turfshowtimes.com', name: 'Turf Show Times' },
  MIA: { domain: 'thephinsider.com', name: 'The Phinsider' },
  MIN: { domain: 'dailynorseman.com', name: 'Daily Norseman' },
  NE: { domain: 'patspulpit.com', name: 'Pats Pulpit' },
  NO: { domain: 'canalstreetchronicles.com', name: 'Canal Street Chronicles' },
  NYG: { domain: 'bigblueview.com', name: 'Big Blue View' },
  NYJ: { domain: 'ganggreennation.com', name: 'Gang Green Nation' },
  PHI: { domain: 'bleedinggreennation.com', name: 'Bleeding Green Nation' },
  PIT: { domain: 'behindthesteelcurtain.com', name: 'Behind The Steel Curtain' },
  SF: { domain: 'ninersnation.com', name: 'Niners Nation' },
  SEA: { domain: 'fieldgulls.com', name: 'Field Gulls' },
  TB: { domain: 'bucsnation.com', name: 'Bucs Nation' },
  TEN: { domain: 'musiccitymiracles.com', name: 'Music City Miracles' },
  WSH: { domain: 'hogshaven.com', name: 'Hogs Haven' },
};

const RSS_SOURCES = [
  { name: 'NFL.com', url: 'https://www.nfl.com/feeds-rs/headlines/news.rss', id: 'nfl-com' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss', id: 'yahoo' },
];

let generalCache = { articles: null, fetchedAt: 0 };
const teamCache = new Map(); // teamAbbrev → { articles, fetchedAt }

// Decode the handful of HTML entities that show up in RSS titles/descriptions.
const NAMED_ENTITIES = {
  '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
};
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => NAMED_ENTITIES[m] || m);
}

async function fetchEspnNews(limit = 50) {
  const res = await fetch(`${ESPN_NEWS_URL}?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.articles || []).map((a) => {
    const categories = (a.categories || []).map((c) => c.description || '');
    const isFantasy = categories.some((c) => c.toLowerCase().includes('fantasy'));
    return {
      id: `espn-${a.dataSourceIdentifier || Date.now()}`,
      headline: decodeEntities(a.headline),
      description: decodeEntities(a.description || ''),
      published: a.published,
      imageUrl: a.images?.[0]?.url || null,
      link: a.links?.web?.href || null,
      type: isFantasy ? 'fantasy' : 'nfl',
      source: 'ESPN',
    };
  });
}

async function fetchRssSource(src, limit = 20) {
  try {
    const feed = await rss.parseURL(src.url);
    return (feed.items || []).slice(0, limit).map((item) => ({
      id: `${src.id}-${item.guid || item.link || Math.random()}`,
      headline: decodeEntities(item.title || ''),
      description: decodeEntities((item.contentSnippet || item.content || '').slice(0, 200)),
      published: item.isoDate || item.pubDate || new Date().toISOString(),
      imageUrl: item.enclosure?.url || null,
      link: item.link || null,
      type: 'nfl',
      source: src.name,
    }));
  } catch (err) {
    console.error(`[news] RSS fetch failed for ${src.name}:`, err.message);
    return [];
  }
}

function dedupeByHeadline(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = a.headline.toLowerCase().slice(0, 40);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAllNews() {
  if (generalCache.articles && Date.now() - generalCache.fetchedAt < CACHE_TTL) {
    return generalCache.articles;
  }

  const results = await Promise.allSettled([
    fetchEspnNews(),
    ...RSS_SOURCES.map((src) => fetchRssSource(src)),
  ]);

  const articles = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  articles.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  const deduped = dedupeByHeadline(articles);

  generalCache = { articles: deduped, fetchedAt: Date.now() };
  return deduped;
}

async function fetchEspnTeamNews(teamAbbrev) {
  const teamId = ESPN_TEAM_IDS[teamAbbrev];
  if (!teamId) return [];
  const res = await fetch(`${ESPN_NEWS_URL}?team=${teamId}&limit=25`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.articles || []).map((a) => ({
    id: `espn-team-${a.dataSourceIdentifier || Math.random()}`,
    headline: decodeEntities(a.headline),
    description: decodeEntities(a.description || ''),
    published: a.published,
    imageUrl: a.images?.[0]?.url || null,
    link: a.links?.web?.href || null,
    type: 'nfl',
    source: 'ESPN',
  }));
}

async function fetchTeamNews(teamAbbrev) {
  const cached = teamCache.get(teamAbbrev);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.articles;
  }

  const blog = SB_NATION[teamAbbrev];
  const tasks = [fetchEspnTeamNews(teamAbbrev)];
  if (blog) {
    tasks.push(fetchRssSource({ name: blog.name, url: `https://www.${blog.domain}/rss/index.xml`, id: `sbn-${teamAbbrev}` }, 15));
  }

  const results = await Promise.allSettled(tasks);
  const merged = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  merged.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  const articles = dedupeByHeadline(merged);

  teamCache.set(teamAbbrev, { articles, fetchedAt: Date.now() });
  return articles;
}

module.exports = { fetchAllNews, fetchTeamNews };
