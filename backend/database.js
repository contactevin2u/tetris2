import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Database functions
export const db = {
  // Get top scores from leaderboard
  async getTopScores(limit = 100) {
    const query = `
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
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  },

  // Add new score to leaderboard
  async addScore(playerName, score, lines, gameDuration, roomId) {
    const query = `
      INSERT INTO leaderboard (player_name, score, lines, game_duration, room_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [playerName, score, lines, gameDuration, roomId]);
    return result.rows[0];
  },

  // Get player's best score
  async getPlayerBestScore(playerName) {
    const query = `
      SELECT *
      FROM leaderboard
      WHERE player_name = $1
      ORDER BY score DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [playerName]);
    return result.rows[0] || null;
  },

  // Get today's top scores
  async getTodayTopScores(limit = 10) {
    const query = `
      SELECT
        id,
        player_name,
        score,
        lines,
        game_duration,
        created_at,
        ROW_NUMBER() OVER (ORDER BY score DESC, created_at ASC) as rank
      FROM leaderboard
      WHERE created_at >= CURRENT_DATE
      ORDER BY score DESC, created_at ASC
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  },

  // Get player rank
  async getPlayerRank(score) {
    const query = `
      SELECT COUNT(*) + 1 as rank
      FROM leaderboard
      WHERE score > $1
    `;
    const result = await pool.query(query, [score]);
    return result.rows[0].rank;
  },

  // Initialize database (create tables)
  async initialize() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS leaderboard (
          id SERIAL PRIMARY KEY,
          player_name VARCHAR(100) NOT NULL,
          score INTEGER NOT NULL DEFAULT 0,
          lines INTEGER NOT NULL DEFAULT 0,
          game_duration INTEGER NOT NULL DEFAULT 0,
          room_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at DESC)
      `);

      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
};

export default pool;
