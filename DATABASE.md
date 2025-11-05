# Database Setup Guide

This guide explains how to set up PostgreSQL for the Tetris multiplayer leaderboard.

## Local Development

### 1. Install PostgreSQL

**Windows:**
- Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Or use `winget install PostgreSQL.PostgreSQL`

**Mac:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE tetris_db;

# Create user (optional)
CREATE USER tetris_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE tetris_db TO tetris_user;

# Exit
\q
```

### 3. Configure Environment

Create `backend/.env` file:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/tetris_db
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### 4. Initialize Database

The server will automatically create tables on first run. Or manually run:

```bash
cd backend
psql -U postgres -d tetris_db -f schema.sql
```

## Production Deployment (Render)

### 1. Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "PostgreSQL"
3. Configure:
   - **Name:** tetris-db
   - **Database:** tetris_db
   - **User:** tetris_user
   - **Region:** Same as your web service
   - **Plan:** Free or Starter
4. Click "Create Database"

### 2. Get Connection String

After creation, copy the **Internal Database URL** or **External Database URL**:
- Internal: `postgresql://user:pass@hostname:5432/database` (use this if backend is on Render)
- External: Use if connecting from outside Render

### 3. Configure Web Service

In your Render web service (backend):

1. Go to **Environment** tab
2. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** [Paste the database URL from step 2]

### 4. Deploy

The database tables will be created automatically when the server starts.

## REST API Endpoints

### Get Leaderboard (All-Time Top Scores)
```
GET /api/leaderboard?limit=100
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "player_name": "Alice",
      "score": 5000,
      "lines": 50,
      "game_duration": 180,
      "created_at": "2025-11-05T10:30:00.000Z",
      "rank": 1
    }
  ]
}
```

### Get Today's Top Scores
```
GET /api/leaderboard/today?limit=10
```

### Submit Score
```
POST /api/leaderboard
Content-Type: application/json

{
  "playerName": "Alice",
  "score": 5000,
  "lines": 50,
  "gameDuration": 180,
  "roomId": "room-123"
}
```

### Get Player's Best Score
```
GET /api/player/:playerName
```

## Database Schema

```sql
CREATE TABLE leaderboard (
  id SERIAL PRIMARY KEY,
  player_name VARCHAR(100) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL DEFAULT 0,
  game_duration INTEGER NOT NULL DEFAULT 0,
  room_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Connection Errors

**Error:** `ECONNREFUSED`
- Make sure PostgreSQL is running
- Check DATABASE_URL is correct

**Error:** `password authentication failed`
- Verify username and password in DATABASE_URL
- Check pg_hba.conf authentication method

### SSL Errors (Production)

If you get SSL errors on Render, the code automatically handles this:
```javascript
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
```

### Reset Database

```sql
DROP TABLE IF EXISTS leaderboard CASCADE;
```

Then restart the server to recreate tables.

## Backup & Restore

### Backup
```bash
pg_dump -U postgres tetris_db > backup.sql
```

### Restore
```bash
psql -U postgres tetris_db < backup.sql
```
