-- Multiple leagues per user. One row per (user, league); one is_active per user.
CREATE TABLE IF NOT EXISTS user_leagues (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  espn_league_id VARCHAR(50) NOT NULL,
  espn_team_id INT,
  league_name VARCHAR(255),
  espn_swid TEXT,
  espn_s2 TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, espn_league_id)
);

CREATE INDEX IF NOT EXISTS idx_user_leagues_user ON user_leagues(user_id);

-- Backfill: move each user's existing single league into the new table,
-- marked active. Idempotent — safe to re-run.
INSERT INTO user_leagues (user_id, espn_league_id, espn_team_id, espn_swid, espn_s2, is_active)
SELECT id, espn_league_id, espn_team_id, espn_swid, espn_s2, TRUE
FROM users
WHERE espn_league_id IS NOT NULL
ON CONFLICT (user_id, espn_league_id) DO NOTHING;
