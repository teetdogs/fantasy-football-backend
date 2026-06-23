-- Players table - core player data
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  espn_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(10) NOT NULL,
  team VARCHAR(10) NOT NULL,
  nfl_team VARCHAR(10),
  bye_week INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ADP history - tracks Average Draft Position over time
CREATE TABLE IF NOT EXISTS adp_history (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  adp DECIMAL(5, 1),
  adp_floor DECIMAL(5, 1),
  adp_ceiling DECIMAL(5, 1),
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, snapshot_date)
);

-- ESPN projections - projected points, stats, etc.
CREATE TABLE IF NOT EXISTS projections (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  projected_points DECIMAL(6, 2),
  projected_passes INT,
  projected_completions INT,
  projected_rushing_yards INT,
  projected_receiving_yards INT,
  projected_touchdowns INT,
  projection_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, projection_date)
);

-- Custom rankings - pre-computed rankings by strategy
CREATE TABLE IF NOT EXISTS rankings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  ranking_date DATE NOT NULL,
  strategy_config JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, ranking_date)
);

-- Ranking entries - individual player rankings within a strategy
CREATE TABLE IF NOT EXISTS ranking_entries (
  id SERIAL PRIMARY KEY,
  ranking_id INT NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  score DECIMAL(10, 2),
  UNIQUE(ranking_id, player_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_adp_history_player_id ON adp_history(player_id);
CREATE INDEX IF NOT EXISTS idx_adp_history_date ON adp_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_projections_player_id ON projections(player_id);
CREATE INDEX IF NOT EXISTS idx_projections_date ON projections(projection_date);
CREATE INDEX IF NOT EXISTS idx_ranking_entries_ranking_id ON ranking_entries(ranking_id);
CREATE INDEX IF NOT EXISTS idx_ranking_entries_rank ON ranking_entries(rank);
