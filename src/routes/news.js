const express = require('express');
const newsService = require('../services/newsService');

const router = express.Router();

/**
 * GET /api/news
 * Returns aggregated NFL + fantasy news from all sources.
 * Query params: type=all|nfl|fantasy (default: all)
 */
router.get('/', async (req, res) => {
  try {
    const articles = await newsService.fetchAllNews();
    const type = req.query.type || 'all';

    const filtered = type === 'all'
      ? articles
      : articles.filter((a) => a.type === type);

    res.json({ articles: filtered, count: filtered.length });
  } catch (err) {
    console.error('Error fetching news:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/news/ticker
 * Returns just headlines for the live ticker (lightweight).
 */
router.get('/ticker', async (req, res) => {
  try {
    const articles = await newsService.fetchAllNews();
    const ticker = articles.slice(0, 20).map((a) => ({
      headline: a.headline,
      type: a.type,
      source: a.source,
      link: a.link,
    }));
    res.json({ ticker });
  } catch (err) {
    console.error('Error fetching ticker:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/news/team/:abbrev
 * Returns news for a specific NFL team.
 */
router.get('/team/:abbrev', async (req, res) => {
  try {
    const articles = await newsService.fetchTeamNews(req.params.abbrev.toUpperCase());
    res.json({ articles, count: articles.length });
  } catch (err) {
    console.error('Error fetching team news:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
