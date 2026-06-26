/**
 * NFL News Service — aggregates headlines from multiple sources.
 * ESPN (JSON API), NFL.com (RSS), Yahoo Sports (RSS).
 * Caches results for 10 minutes.
 */

const Parser = require('rss-parser');
const rss = new Parser({ timeout: 8000 });

const ESPN_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const ESPN_TEAM_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
const CACHE_TTL = 10 * 60 * 1000;

const RSS_SOURCES = [
  { name: 'NFL.com', url: 'https://www.nfl.com/feeds-rs/headlines/news.rss', id: 'nfl-com' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss', id: 'yahoo' },
];

let generalCache = { articles: null, fetchedAt: 0 };
let teamCache = new Map(); // teamAbbrev → { articles, fetchedAt }

async function fetchEspnNews(limit = 30) {
  const res = await fetch(`${ESPN_NEWS_URL}?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.articles || []).map((a) => {
    const categories = (a.categories || []).map((c) => c.description || '');
    const isFantasy = categories.some((c) => c.toLowerCase().includes('fantasy'));
    return {
      id: `espn-${a.dataSourceIdentifier || Date.now()}`,
      headline: a.headline,
      description: a.description || '',
      published: a.published,
      imageUrl: a.images?.[0]?.url || null,
      link: a.links?.web?.href || null,
      type: isFantasy ? 'fantasy' : 'nfl',
      source: 'ESPN',
    };
  });
}

async function fetchRssSource(src) {
  try {
    const feed = await rss.parseURL(src.url);
    return (feed.items || []).slice(0, 15).map((item) => ({
      id: `${src.id}-${item.guid || item.link || Date.now()}`,
      headline: item.title || '',
      description: (item.contentSnippet || item.content || '').slice(0, 200),
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

  // Sort by published date, newest first
  articles.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

  // Deduplicate by similar headlines
  const seen = new Set();
  const deduped = articles.filter((a) => {
    const key = a.headline.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  generalCache = { articles: deduped, fetchedAt: Date.now() };
  return deduped;
}

async function fetchTeamNews(teamAbbrev) {
  const cached = teamCache.get(teamAbbrev);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.articles;
  }

  // ESPN team news endpoint
  const res = await fetch(`${ESPN_TEAM_URL}/${teamAbbrev}/news`);
  if (!res.ok) return [];
  const data = await res.json();

  const articles = (data.articles || []).map((a) => ({
    id: `espn-team-${a.dataSourceIdentifier || Date.now()}`,
    headline: a.headline,
    description: a.description || '',
    published: a.published,
    imageUrl: a.images?.[0]?.url || null,
    link: a.links?.web?.href || null,
    type: 'nfl',
    source: 'ESPN',
  }));

  teamCache.set(teamAbbrev, { articles, fetchedAt: Date.now() });
  return articles;
}

module.exports = { fetchAllNews, fetchTeamNews };
