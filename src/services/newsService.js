/**
 * NFL News Service — fetches headlines from ESPN's public news API.
 * Caches results for 10 minutes to avoid hammering the endpoint.
 */

const ESPN_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let cache = { articles: null, fetchedAt: 0 };

async function fetchNews(limit = 40) {
  if (cache.articles && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.articles;
  }

  const res = await fetch(`${ESPN_NEWS_URL}?limit=${limit}`);
  if (!res.ok) throw new Error(`ESPN news returned ${res.status}`);
  const data = await res.json();

  const articles = (data.articles || []).map((a) => {
    const categories = (a.categories || []).map((c) => c.description || '');
    const isFantasy = categories.some((c) => c.toLowerCase().includes('fantasy'));
    return {
      id: a.dataSourceIdentifier || String(a.links?.web?.href || Math.random()),
      headline: a.headline,
      description: a.description || '',
      published: a.published,
      imageUrl: a.images?.[0]?.url || null,
      link: a.links?.web?.href || null,
      type: isFantasy ? 'fantasy' : 'nfl',
      categories,
    };
  });

  cache = { articles, fetchedAt: Date.now() };
  return articles;
}

module.exports = { fetchNews };
