import { io } from 'socket.io-client';

// Configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const BLOCK_SIZE = 15; // Smaller for main canvas
const OPPONENT_BLOCK_SIZE = 8; // Even smaller for opponent canvases
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
let myPlayerName = 'Anonymous';
let currentRoom = null;
let gameActive = false;
let myGame = null;
let opponentGames = new Map();
let allPlayers = new Map();
let gameStartTime = null;
let timerInterval = null;

// Initialize socket connection immediately
socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  timeout: 10000
});

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
  constructor(canvas, playerId, blockSize = BLOCK_SIZE) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerId = playerId;
    this.blockSize = blockSize;
    this.board = this.createBoard();
    this.score = 0;
    this.lines = 0;
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
      this.lines += linesCleared;
      this.score += linesCleared * 100;

      // Update UI
      if (this.isMyGame) {
        document.getElementById('main-score').textContent = this.score;
        document.getElementById('main-lines').textContent = this.lines;
      }

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
    const bs = this.blockSize;

    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw board
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (this.board[y][x]) {
          this.ctx.fillStyle = this.board[y][x];
          this.ctx.fillRect(x * bs, y * bs, bs - 1, bs - 1);
        }
      }
    }

    // Draw current piece
    if (this.currentPiece && !this.gameOver) {
      this.ctx.fillStyle = this.currentPiece.color;
      for (let y = 0; y < this.currentPiece.shape.length; y++) {
        for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
          if (this.currentPiece.shape[y][x]) {
            const drawX = (this.currentPiece.x + x) * bs;
            const drawY = (this.currentPiece.y + y) * bs;
            this.ctx.fillRect(drawX, drawY, bs - 1, bs - 1);
          }
        }
      }
    }

    // Draw grid
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 0.5;
    for (let x = 0; x <= BOARD_WIDTH; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * bs, 0);
      this.ctx.lineTo(x * bs, BOARD_HEIGHT * bs);
      this.ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * bs);
      this.ctx.lineTo(BOARD_WIDTH * bs, y * bs);
      this.ctx.stroke();
    }
  }

  getState() {
    return {
      board: this.board,
      currentPiece: this.currentPiece,
      score: this.score,
      lines: this.lines,
      gameOver: this.gameOver
    };
  }

  setState(state) {
    this.board = state.board;
    this.currentPiece = state.currentPiece;
    this.score = state.score;
    this.lines = state.lines || 0;
    this.gameOver = state.gameOver;
  }
}

// Timer functions
function startTimer() {
  gameStartTime = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!gameActive || !gameStartTime) return;

  const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  document.getElementById('game-timer').textContent =
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Scoreboard functions
function updateScoreboard(scores) {
  const scoreboardList = document.getElementById('scoreboard-list');

  // Convert scores object to array with player names
  const scoreArray = Object.entries(scores).map(([playerId, score]) => ({
    playerId,
    name: allPlayers.get(playerId) || 'Player',
    score
  }));

  // Sort by score descending
  scoreArray.sort((a, b) => b.score - a.score);

  // Update scoreboard HTML
  scoreboardList.innerHTML = '';
  scoreArray.forEach((player, index) => {
    const div = document.createElement('div');
    div.className = 'scoreboard-item';

    // Add rank classes
    if (index === 0) div.classList.add('rank-1');
    else if (index === 1) div.classList.add('rank-2');
    else if (index === 2) div.classList.add('rank-3');

    // Highlight current player
    if (player.playerId === myPlayerId) {
      div.classList.add('current-player');
    }

    div.innerHTML = `
      <span class="scoreboard-rank">#${index + 1}</span>
      <span class="scoreboard-name">${player.name}${player.playerId === myPlayerId ? ' (You)' : ''}</span>
      <span class="scoreboard-score">${player.score}</span>
    `;

    scoreboardList.appendChild(div);
  });
}

// Create opponent board
function createOpponentBoard(playerId, playerName) {
  const opponentBoardsContainer = document.getElementById('opponent-boards');

  const boardDiv = document.createElement('div');
  boardDiv.className = 'opponent-board';
  boardDiv.id = `opponent-${playerId}`;

  const canvas = document.createElement('canvas');
  canvas.className = 'opponent-canvas';
  canvas.width = BOARD_WIDTH * OPPONENT_BLOCK_SIZE;
  canvas.height = BOARD_HEIGHT * OPPONENT_BLOCK_SIZE;

  boardDiv.innerHTML = `
    <div class="opponent-name">${playerName}</div>
  `;
  boardDiv.appendChild(canvas);
  boardDiv.innerHTML += `
    <div class="opponent-stats">Score: <span class="opp-score">0</span></div>
  `;

  opponentBoardsContainer.appendChild(boardDiv);

  // Create game instance for this opponent
  const game = new TetrisGame(canvas, playerId, OPPONENT_BLOCK_SIZE);
  opponentGames.set(playerId, game);

  return game;
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
  myPlayerName = playerName;
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

  // Store all players
  players.forEach(player => {
    allPlayers.set(player.id, player.name);
  });

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
  startTimer();
});

socket.on('player-update', ({ playerId, board, currentPiece, score, lines }) => {
  if (playerId === myPlayerId) return; // Don't update our own board

  // Get or create opponent game
  let game = opponentGames.get(playerId);
  if (!game) {
    const playerName = allPlayers.get(playerId) || 'Player';
    game = createOpponentBoard(playerId, playerName);
  }

  // Update game state
  game.setState({ board, currentPiece, score, lines: lines || 0, gameOver: false });
  game.draw();

  // Update score in opponent stats
  const oppBoard = document.getElementById(`opponent-${playerId}`);
  if (oppBoard) {
    const scoreEl = oppBoard.querySelector('.opp-score');
    if (scoreEl) scoreEl.textContent = score;
  }
});

socket.on('scores-update', (scores) => {
  updateScoreboard(scores);
});

socket.on('player-died', (playerId) => {
  const oppBoard = document.getElementById(`opponent-${playerId}`);
  if (oppBoard) {
    oppBoard.classList.add('dead');
  }
});

socket.on('receive-attack', (lines) => {
  if (myGame && !myGame.gameOver) {
    myGame.addGarbageLines(lines);
  }
});

socket.on('game-finished', ({ winner, scores }) => {
  gameActive = false;
  stopTimer();

  const winnerInfo = document.getElementById('winner-info');
  if (winner === myPlayerId) {
    winnerInfo.innerHTML = '<h3>🏆 You Won! 🏆</h3>';
  } else {
    const winnerName = allPlayers.get(winner) || 'Player';
    winnerInfo.innerHTML = `<h3>Game Over! ${winnerName} Won!</h3>`;
  }

  const finalScores = document.getElementById('final-scores');
  finalScores.innerHTML = '<h3>Final Scores:</h3>';

  // Sort scores
  const scoreArray = Object.entries(scores).map(([playerId, score]) => ({
    playerId,
    name: allPlayers.get(playerId) || 'Player',
    score
  })).sort((a, b) => b.score - a.score);

  scoreArray.forEach(player => {
    const div = document.createElement('div');
    div.className = 'score-item';
    div.innerHTML = `
      <span>${player.name} ${player.playerId === myPlayerId ? '(You)' : ''}</span>
      <span>${player.score}</span>
    `;
    finalScores.appendChild(div);
  });

  showScreen('gameOver');
});

// Game initialization
function startGame() {
  // Set up main player board
  const mainCanvas = document.getElementById('main-canvas');
  myGame = new TetrisGame(mainCanvas, myPlayerId, BLOCK_SIZE);
  myGame.isMyGame = true;

  // Update player name
  document.querySelector('.main-player-name').textContent = myPlayerName;

  // Create opponent boards for all other players
  allPlayers.forEach((name, playerId) => {
    if (playerId !== myPlayerId) {
      createOpponentBoard(playerId, name);
    }
  });

  // Initialize scoreboard
  const initialScores = {};
  allPlayers.forEach((name, playerId) => {
    initialScores[playerId] = 0;
  });
  updateScoreboard(initialScores);

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
        score: state.score,
        lines: state.lines
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
