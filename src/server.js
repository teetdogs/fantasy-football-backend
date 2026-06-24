const express = require('express');
const cors = require('cors');
require('dotenv').config();

const playerStore = require('./services/playerStore');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint — includes data source/freshness
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), data: playerStore.getMeta() });
});

// Routes
app.use('/api/players', require('./routes/players'));
app.use('/api/rankings', require('./routes/rankings'));
app.use('/api/algorithms', require('./routes/algorithms'));
app.use('/api/draft', require('./routes/draft'));
app.use('/api/league', require('./routes/league'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Fantasy Football Backend running on port ${PORT}`);
  // Warm the player cache on boot so the first request is fast.
  playerStore.refresh();
});
