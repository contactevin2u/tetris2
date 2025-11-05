-- Tetris Multiplayer Leaderboard Schema

-- Create leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  player_name VARCHAR(100) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL DEFAULT 0,
  game_duration INTEGER NOT NULL DEFAULT 0, -- in seconds
  room_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on score for faster queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at DESC);

-- Optional: Create a view for top 100 all-time scores
CREATE OR REPLACE VIEW top_scores AS
SELECT
  id,
  player_name,
  score,
  lines,
  game_duration,
  created_at,
  ROW_NUMBER() OVER (ORDER BY score DESC, created_at ASC) as rank
FROM leaderboard
ORDER BY score DESC, created_at ASC
LIMIT 100;
