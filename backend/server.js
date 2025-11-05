import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
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
      if (room.players.every(p => p.ready) && room.players.length >= 2) {
        room.gameState = 'playing';
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
        io.to(roomId).emit('game-finished', {
          winner: alivePlayers[0]?.id,
          scores: room.scores
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
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
