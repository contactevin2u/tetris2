# Multiplayer Tetris

A real-time 4-player Tetris game with WebSocket multiplayer support. Built with Node.js, Express, Socket.io, and vanilla JavaScript.

## Features

- 🎮 Classic Tetris gameplay
- 👥 Real-time 4-player multiplayer
- 🚀 WebSocket-based game synchronization
- 💣 Attack other players by clearing multiple lines
- 🏆 Live scoring and winner detection
- 📱 Responsive design

## Tech Stack

**Frontend:**
- Vite
- Vanilla JavaScript
- Socket.io Client
- HTML5 Canvas

**Backend:**
- Node.js
- Express
- Socket.io
- CORS

## Project Structure

```
tetris2/
├── frontend/           # Vite frontend application
│   ├── index.html     # Main HTML file
│   ├── main.js        # Game logic and Socket.io client
│   ├── style.css      # Styles
│   ├── package.json
│   ├── vercel.json    # Vercel deployment config
│   └── .env.example
├── backend/           # Express + Socket.io server
│   ├── server.js      # WebSocket server
│   ├── package.json
│   ├── render.yaml    # Render deployment config
│   └── .env.example
└── README.md
```

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (optional):
```bash
cp .env.example .env
```

4. Start the server:
```bash
npm run dev
```

Server will run on `http://localhost:3000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (optional for local dev):
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:5173`

### Playing Locally

1. Open `http://localhost:5173` in your browser
2. Enter your name
3. Click "Join Game"
4. Wait for other players to join
5. Click "Ready" when ready to start
6. Game starts when all players are ready

## Controls

- **←/→** - Move piece left/right
- **↓** - Soft drop
- **↑** - Rotate piece
- **Space** - Hard drop

## Gameplay

- Clear lines to score points
- Clearing 2+ lines sends garbage lines to opponents
- Last player standing wins
- Score is tracked throughout the game

## Deployment

### Deploy Backend to Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set root directory to `backend`
4. Use the following settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variable:
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://your-app.vercel.app`)
6. Deploy!

Your backend will be available at `https://your-app.onrender.com`

### Deploy Frontend to Vercel

1. Install Vercel CLI (optional):
```bash
npm install -g vercel
```

2. Deploy using Vercel CLI:
```bash
cd frontend
vercel
```

Or deploy via [Vercel Dashboard](https://vercel.com):
- Import your GitHub repository
- Set root directory to `frontend`
- Add environment variable:
  - `VITE_BACKEND_URL`: Your Render backend URL (e.g., `https://your-app.onrender.com`)
- Deploy!

Your frontend will be available at `https://your-app.vercel.app`

## Environment Variables

### Backend (.env)

```
PORT=3000
FRONTEND_URL=https://your-frontend-url.vercel.app
NODE_ENV=production
```

### Frontend (.env)

```
VITE_BACKEND_URL=https://your-backend-url.onrender.com
```

## Game Mechanics

### Scoring
- 1 line cleared: 100 points
- 2 lines cleared: 200 points (+ 1 garbage line to opponents)
- 3 lines cleared: 300 points (+ 2 garbage lines to opponents)
- 4 lines cleared: 400 points (+ 3 garbage lines to opponents)

### Attack System
- Clearing 2+ lines sends garbage lines to all alive opponents
- Garbage lines appear at the bottom with one random hole
- Strategic clearing can overwhelm opponents

### Win Conditions
- Game ends when only 0-1 players remain alive
- Player with highest score at game end is declared winner

## Development Notes

- Backend uses Socket.io rooms for multiplayer sessions
- Each room supports up to 4 players
- Game state is synchronized in real-time
- Automatic room cleanup when all players disconnect

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
