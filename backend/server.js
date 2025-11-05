import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { db } from './database.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Store active game rooms
const rooms = new Map();
const MAX_PLAYERS = 4;
const gameStartTimes = new Map(); // Track when games start

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// REST API Endpoints for Leaderboard

// Get top scores (all-time)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const scores = await db.getTopScores(limit);
    res.json({ success: true, data: scores });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

// Get today's top scores
app.get('/api/leaderboard/today', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const scores = await db.getTodayTopScores(limit);
    res.json({ success: true, data: scores });
  } catch (error) {
    console.error('Error fetching today\'s leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch today\'s leaderboard' });
  }
});

// Submit score to leaderboard
app.post('/api/leaderboard', async (req, res) => {
  try {
    const { playerName, score, lines, gameDuration, roomId } = req.body;

    if (!playerName || score === undefined) {
      return res.status(400).json({ success: false, error: 'Player name and score are required' });
    }

    const result = await db.addScore(
      playerName,
      parseInt(score) || 0,
      parseInt(lines) || 0,
      parseInt(gameDuration) || 0,
      roomId || null
    );

    // Get player's rank
    const rank = await db.getPlayerRank(result.score);

    res.json({
      success: true,
      data: { ...result, rank }
    });
  } catch (error) {
    console.error('Error adding score:', error);
    res.status(500).json({ success: false, error: 'Failed to add score' });
  }
});

// Get player's best score
app.get('/api/player/:playerName', async (req, res) => {
  try {
    const { playerName } = req.params;
    const bestScore = await db.getPlayerBestScore(playerName);

    if (!bestScore) {
      return res.json({ success: true, data: null, message: 'No scores found for this player' });
    }

    const rank = await db.getPlayerRank(bestScore.score);

    res.json({
      success: true,
      data: { ...bestScore, rank }
    });
  } catch (error) {
    console.error('Error fetching player score:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch player score' });
  }
});

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Join or create a room
  socket.on('join-room', ({ playerName, roomId }) => {
    // If no roomId provided, find available room or create new one
    if (!roomId) {
      roomId = findAvailableRoom();
    }

    // Check if room exists and has space
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        players: [],
        gameState: 'waiting', // waiting, playing, finished
        scores: {}
      });
    }

    const room = rooms.get(roomId);

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('room-full');
      return;
    }

    // Add player to room
    const player = {
      id: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      ready: false,
      alive: true
    };

    room.players.push(player);
    room.scores[socket.id] = 0;
    socket.join(roomId);
    socket.roomId = roomId;

    // Send room info to all players in room
    io.to(roomId).emit('room-update', {
      roomId,
      players: room.players,
      gameState: room.gameState
    });

    console.log(`Player ${player.name} joined room ${roomId}`);
  });

  // Player ready status
  socket.on('player-ready', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = true;
      io.to(roomId).emit('room-update', {
        roomId,
        players: room.players,
        gameState: room.gameState
      });

      // Start game if all players are ready
      if (room.players.every(p => p.ready) && room.players.length >= 1) {
        room.gameState = 'playing';
        gameStartTimes.set(roomId, Date.now()); // Track game start time
        io.to(roomId).emit('game-start');
      }
    }
  });

  // Game state updates
  socket.on('game-update', (gameData) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    // Broadcast game state to other players in room
    socket.to(roomId).emit('player-update', {
      playerId: socket.id,
      ...gameData
    });
  });

  // Score update
  socket.on('score-update', (score) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.scores[socket.id] = score;
      io.to(roomId).emit('scores-update', room.scores);
    }
  });

  // Player game over
  socket.on('game-over', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.alive = false;
      io.to(roomId).emit('player-died', socket.id);

      // Check if game is over (only 0 or 1 players alive)
      const alivePlayers = room.players.filter(p => p.alive);
      if (alivePlayers.length <= 1) {
        room.gameState = 'finished';

        // Calculate game duration
        const gameStartTime = gameStartTimes.get(roomId) || Date.now();
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 1000); // in seconds

        // Save all players' scores to database
        room.players.forEach(async (player) => {
          const playerScore = room.scores[player.id] || 0;
          try {
            await db.addScore(
              player.name,
              playerScore,
              0, // lines - will be sent from client in future
              gameDuration,
              roomId
            );
            console.log(`Saved score for ${player.name}: ${playerScore}`);
          } catch (error) {
            console.error(`Error saving score for ${player.name}:`, error);
          }
        });

        // Clean up game start time
        gameStartTimes.delete(roomId);

        io.to(roomId).emit('game-finished', {
          winner: alivePlayers[0]?.id,
          scores: room.scores,
          gameDuration
        });
      }
    }
  });

  // Send attack lines to other players
  socket.on('send-attack', (lines) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Send attack to all alive players except sender
    room.players.forEach(player => {
      if (player.id !== socket.id && player.alive) {
        io.to(player.id).emit('receive-attack', lines);
      }
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Remove player from room
    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.scores[socket.id];

    if (room.players.length === 0) {
      // Delete empty room
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted`);
    } else {
      // Notify remaining players
      io.to(roomId).emit('room-update', {
        roomId,
        players: room.players,
        gameState: room.gameState
      });
    }
  });
});

// Helper function to find available room
function findAvailableRoom() {
  // Find first room with less than MAX_PLAYERS
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length < MAX_PLAYERS && room.gameState === 'waiting') {
      return roomId;
    }
  }
  // Create new room ID
  return `room-${Date.now()}`;
}

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database (create tables if they don't exist)
    await db.initialize();
    console.log('Database initialized');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`REST API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
