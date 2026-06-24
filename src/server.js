const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
require('dotenv').config();

const pool = require('./db/connection');
const playerStore = require('./services/playerStore');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Trust the reverse proxy (Render/Railway/Vercel) so secure cookies work in prod.
// Without this, express-session sees HTTP behind the proxy and refuses to set
// secure cookies — login silently fails.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Session — stored in PostgreSQL via connect-pg-simple
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'draft-lab-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// Health check endpoint — includes data source/freshness
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), data: playerStore.getMeta() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
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
  playerStore.refresh();
});
