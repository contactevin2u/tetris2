import { io } from 'socket.io-client';

// Configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const BLOCK_SIZE = 20;
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

// Tetromino shapes
const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]]
};

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000'
};

// Game state
let socket = null;
let myPlayerId = null;
let currentRoom = null;
let gameActive = false;
let myGame = null;

// Initialize socket connection immediately
socket = io(BACKEND_URL);

socket.on('connect', () => {
  console.log('Connected to server');
  myPlayerId = socket.id;
  const joinBtn = document.getElementById('join-btn');
  joinBtn.disabled = false;
  joinBtn.textContent = 'Join Game';
  document.getElementById('lobby-status').textContent = '✓ Connected to server';
  document.getElementById('lobby-status').style.color = '#4CAF50';
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  document.getElementById('lobby-status').textContent = '✗ Disconnected from server';
  document.getElementById('lobby-status').style.color = '#f44336';
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  document.getElementById('lobby-status').textContent = '✗ Cannot connect to server. Is the backend running?';
  document.getElementById('lobby-status').style.color = '#f44336';
});

// Tetris Game Class
class TetrisGame {
  constructor(canvas, playerId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerId = playerId;
    this.board = this.createBoard();
    this.score = 0;
    this.currentPiece = null;
    this.gameOver = false;
    this.lastMoveTime = 0;
    this.moveInterval = 1000; // 1 second
    this.isMyGame = false;

    this.spawnPiece();
  }

  createBoard() {
    return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
  }

  spawnPiece() {
    const shapes = Object.keys(SHAPES);
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    this.currentPiece = {
      shape: SHAPES[randomShape],
      color: COLORS[randomShape],
      x: Math.floor(BOARD_WIDTH / 2) - 1,
      y: 0
    };

    if (this.collision()) {
      this.gameOver = true;
      if (this.isMyGame) {
        socket.emit('game-over');
      }
    }
  }

  collision(piece = this.currentPiece, offsetX = 0, offsetY = 0) {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const newX = piece.x + x + offsetX;
          const newY = piece.y + y + offsetY;

          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return true;
          }

          if (newY >= 0 && this.board[newY][newX]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  merge() {
    for (let y = 0; y < this.currentPiece.shape.length; y++) {
      for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
        if (this.currentPiece.shape[y][x]) {
          const boardY = this.currentPiece.y + y;
          const boardX = this.currentPiece.x + x;
          if (boardY >= 0) {
            this.board[boardY][boardX] = this.currentPiece.color;
          }
        }
      }
    }
  }

  clearLines() {
    let linesCleared = 0;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (this.board[y].every(cell => cell !== 0)) {
        this.board.splice(y, 1);
        this.board.unshift(Array(BOARD_WIDTH).fill(0));
        linesCleared++;
        y++; // Check same row again
      }
    }

    if (linesCleared > 0) {
      this.score += linesCleared * 100;

      // Send attack to other players if cleared 2+ lines
      if (this.isMyGame && linesCleared >= 2) {
        socket.emit('send-attack', linesCleared - 1);
      }

      if (this.isMyGame) {
        socket.emit('score-update', this.score);
      }
    }
  }

  addGarbageLines(count) {
    // Add garbage lines at the bottom
    for (let i = 0; i < count; i++) {
      this.board.shift(); // Remove top row
      const garbageLine = Array(BOARD_WIDTH).fill('#808080');
      // Add one random hole
      const holePosition = Math.floor(Math.random() * BOARD_WIDTH);
      garbageLine[holePosition] = 0;
      this.board.push(garbageLine);
    }
  }

  move(dx, dy) {
    if (this.gameOver) return false;

    if (!this.collision(this.currentPiece, dx, dy)) {
      this.currentPiece.x += dx;
      this.currentPiece.y += dy;
      return true;
    }

    if (dy > 0) {
      this.merge();
      this.clearLines();
      this.spawnPiece();
    }

    return false;
  }

  rotate() {
    if (this.gameOver) return;

    const rotated = {
      ...this.currentPiece,
      shape: this.currentPiece.shape[0].map((_, i) =>
        this.currentPiece.shape.map(row => row[i]).reverse()
      )
    };

    if (!this.collision(rotated)) {
      this.currentPiece = rotated;
    }
  }

  hardDrop() {
    if (this.gameOver) return;

    while (!this.collision(this.currentPiece, 0, 1)) {
      this.currentPiece.y++;
    }
    this.merge();
    this.clearLines();
    this.spawnPiece();
  }

  update(timestamp) {
    if (this.gameOver || !this.isMyGame) return;

    if (timestamp - this.lastMoveTime > this.moveInterval) {
      this.move(0, 1);
      this.lastMoveTime = timestamp;
    }
  }

  draw() {
    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw board
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (this.board[y][x]) {
          this.ctx.fillStyle = this.board[y][x];
          this.ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        }
      }
    }

    // Draw current piece
    if (this.currentPiece && !this.gameOver) {
      this.ctx.fillStyle = this.currentPiece.color;
      for (let y = 0; y < this.currentPiece.shape.length; y++) {
        for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
          if (this.currentPiece.shape[y][x]) {
            const drawX = (this.currentPiece.x + x) * BLOCK_SIZE;
            const drawY = (this.currentPiece.y + y) * BLOCK_SIZE;
            this.ctx.fillRect(drawX, drawY, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
          }
        }
      }
    }

    // Draw grid
    this.ctx.strokeStyle = '#333';
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * BLOCK_SIZE, 0);
      this.ctx.lineTo(x * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);
      this.ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * BLOCK_SIZE);
      this.ctx.lineTo(BOARD_WIDTH * BLOCK_SIZE, y * BLOCK_SIZE);
      this.ctx.stroke();
    }
  }

  getState() {
    return {
      board: this.board,
      currentPiece: this.currentPiece,
      score: this.score,
      gameOver: this.gameOver
    };
  }

  setState(state) {
    this.board = state.board;
    this.currentPiece = state.currentPiece;
    this.score = state.score;
    this.gameOver = state.gameOver;
  }
}

// UI Management
const screens = {
  lobby: document.getElementById('lobby'),
  waitingRoom: document.getElementById('waiting-room'),
  gameScreen: document.getElementById('game-screen'),
  gameOver: document.getElementById('game-over')
};

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// Lobby handlers
document.getElementById('join-btn').addEventListener('click', () => {
  if (!socket || !socket.connected) {
    alert('Not connected to server. Please wait...');
    return;
  }

  const playerName = document.getElementById('player-name').value.trim() || 'Anonymous';
  const roomId = document.getElementById('room-id').value.trim() || null;

  socket.emit('join-room', { playerName, roomId });
});

// Waiting room handlers
document.getElementById('ready-btn').addEventListener('click', () => {
  socket.emit('player-ready');
  document.getElementById('ready-btn').disabled = true;
});

document.getElementById('leave-btn').addEventListener('click', () => {
  location.reload();
});

// Game over handler
document.getElementById('play-again-btn').addEventListener('click', () => {
  location.reload();
});

// Socket event handlers
socket.on('room-update', ({ roomId, players, gameState }) => {
  currentRoom = roomId;

  document.getElementById('room-info').innerHTML = `
    <h3>Room ID: ${roomId}</h3>
    <p>Players: ${players.length}/4</p>
  `;

  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '<h3>Players:</h3>';
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = `player-item ${player.ready ? 'ready' : ''}`;
    div.innerHTML = `
      <span>${player.name} ${player.id === myPlayerId ? '(You)' : ''}</span>
      <span>${player.ready ? '✓ Ready' : 'Not Ready'}</span>
    `;
    playersList.appendChild(div);
  });

  showScreen('waitingRoom');
});

socket.on('room-full', () => {
  alert('Room is full! Please try another room.');
});

socket.on('game-start', () => {
  gameActive = true;
  showScreen('gameScreen');
  startGame();
});

socket.on('player-update', ({ playerId, board, currentPiece, score }) => {
  // Update other players' boards
  const playerBoards = Array.from(document.querySelectorAll('.player-board'));
  playerBoards.forEach((boardEl, index) => {
    if (boardEl.dataset.playerId === playerId) {
      const canvas = boardEl.querySelector('.tetris-canvas');
      const game = new TetrisGame(canvas, playerId);
      game.setState({ board, currentPiece, score, gameOver: false });
      game.draw();

      const scoreEl = boardEl.querySelector('.score span');
      scoreEl.textContent = score;
    }
  });
});

socket.on('scores-update', (scores) => {
  const playerBoards = Array.from(document.querySelectorAll('.player-board'));
  playerBoards.forEach(boardEl => {
    const playerId = boardEl.dataset.playerId;
    if (playerId && scores[playerId] !== undefined) {
      const scoreEl = boardEl.querySelector('.score span');
      scoreEl.textContent = scores[playerId];
    }
  });
});

socket.on('player-died', (playerId) => {
  const playerBoards = Array.from(document.querySelectorAll('.player-board'));
  playerBoards.forEach(boardEl => {
    if (boardEl.dataset.playerId === playerId) {
      boardEl.classList.add('dead');
      const statusEl = boardEl.querySelector('.status');
      statusEl.textContent = 'Dead';
      statusEl.classList.add('dead');
    }
  });
});

socket.on('receive-attack', (lines) => {
  if (myGame && !myGame.gameOver) {
    myGame.addGarbageLines(lines);
  }
});

socket.on('game-finished', ({ winner, scores }) => {
  gameActive = false;

  const winnerInfo = document.getElementById('winner-info');
  if (winner === myPlayerId) {
    winnerInfo.innerHTML = '<h3>🏆 You Won! 🏆</h3>';
  } else {
    winnerInfo.innerHTML = '<h3>Game Over</h3>';
  }

  const finalScores = document.getElementById('final-scores');
  finalScores.innerHTML = '<h3>Final Scores:</h3>';
  Object.entries(scores).forEach(([playerId, score]) => {
    const div = document.createElement('div');
    div.className = 'score-item';
    div.innerHTML = `
      <span>Player ${playerId === myPlayerId ? '(You)' : ''}</span>
      <span>${score}</span>
    `;
    finalScores.appendChild(div);
  });

  showScreen('gameOver');
});

// Game initialization
function startGame() {
  const playerBoards = Array.from(document.querySelectorAll('.player-board'));

  // Set up my game board (first available or create first)
  const myBoardIndex = 0; // Use first board for now
  const myBoard = playerBoards[myBoardIndex];
  myBoard.classList.add('active');
  myBoard.dataset.playerId = myPlayerId;

  const canvas = myBoard.querySelector('.tetris-canvas');
  myGame = new TetrisGame(canvas, myPlayerId);
  myGame.isMyGame = true;

  // Hide unused boards
  playerBoards.forEach((board, index) => {
    if (index > 0) {
      board.dataset.playerId = `player-${index}`;
    }
  });

  // Start game loop
  gameLoop();
}

// Game loop
function gameLoop(timestamp = 0) {
  if (!gameActive) return;

  if (myGame) {
    myGame.update(timestamp);
    myGame.draw();

    // Send game state to other players
    if (!myGame.gameOver && timestamp % 100 < 16) { // Throttle updates
      const state = myGame.getState();
      socket.emit('game-update', {
        board: state.board,
        currentPiece: state.currentPiece,
        score: state.score
      });
    }
  }

  requestAnimationFrame(gameLoop);
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (!myGame || !gameActive || myGame.gameOver) return;

  switch (e.key) {
    case 'ArrowLeft':
      myGame.move(-1, 0);
      e.preventDefault();
      break;
    case 'ArrowRight':
      myGame.move(1, 0);
      e.preventDefault();
      break;
    case 'ArrowDown':
      myGame.move(0, 1);
      e.preventDefault();
      break;
    case 'ArrowUp':
      myGame.rotate();
      e.preventDefault();
      break;
    case ' ':
      myGame.hardDrop();
      e.preventDefault();
      break;
  }
});

console.log('Tetris Multiplayer Client Loaded');
