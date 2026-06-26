const express = require('express');
const newsService = require('../services/newsService');

const router = express.Router();

/**
 * GET /api/news
 * Returns NFL + fantasy news articles from ESPN.
 * Query params: type=all|nfl|fantasy (default: all)
 */
router.get('/', async (req, res) => {
  try {
    const articles = await newsService.fetchNews();
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
    const articles = await newsService.fetchNews();
    const ticker = articles.slice(0, 15).map((a) => ({
      headline: a.headline,
      type: a.type,
      link: a.link,
    }));
    res.json({ ticker });
  } catch (err) {
    console.error('Error fetching ticker:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
