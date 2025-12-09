require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const User = require('./models/User');
const Match = require('./models/Match');

const app = express();
const server = http.createServer(app);

// Configuration CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// File d'attente pour le matchmaking
const matchmakingQueue = new Map();
const userSockets = new Map();

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connecte a MongoDB'))
  .catch(err => console.error('Erreur MongoDB:', err));

// Route de test
app.get('/', (req, res) => {
  res.json({ message: 'Clash Arena API is running!' });
});

// Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { gamertag, password } = req.body;

    if (!gamertag || !password) {
      return res.status(400).json({ error: 'Gamertag et mot de passe requis' });
    }
    if (gamertag.length < 3) {
      return res.status(400).json({ error: 'Le gamertag doit faire au moins 3 caracteres' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caracteres' });
    }

    const existingUser = await User.findOne({ 
      gamertag: { $regex: new RegExp('^' + gamertag + '$', 'i') } 
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Ce gamertag est deja pris' });
    }

    const user = new User({ gamertag, password });
    await user.save();

    res.status(201).json({
      id: user._id,
      gamertag: user.gamertag,
      trophies: user.trophies,
      wins: user.wins,
      losses: user.losses
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { gamertag, password } = req.body;

    const user = await User.findOne({ 
      gamertag: { $regex: new RegExp('^' + gamertag + '$', 'i') } 
    });

    if (!user) {
      return res.status(401).json({ error: 'Gamertag ou mot de passe incorrect' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Gamertag ou mot de passe incorrect' });
    }

    user.lastOnline = new Date();
    await user.save();

    res.json({
      id: user._id,
      gamertag: user.gamertag,
      trophies: user.trophies,
      wins: user.wins,
      losses: user.losses
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Recuperer le profil
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouve' });
    }
    res.json({
      id: user._id,
      gamertag: user.gamertag,
      trophies: user.trophies,
      wins: user.wins,
      losses: user.losses
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Classement
app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ trophies: -1 })
      .limit(50);

    res.json(users.map(u => ({
      id: u._id,
      gamertag: u.gamertag,
      trophies: u.trophies,
      wins: u.wins,
      losses: u.losses
    })));
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Socket.io - Temps reel
io.on('connection', (socket) => {
  console.log('Nouveau client connecte:', socket.id);

  socket.on('register_user', (userId) => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    console.log('Utilisateur ' + userId + ' enregistre');
  });

  socket.on('join_queue', async (userId) => {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) return;
      if (matchmakingQueue.has(userId)) return;

      matchmakingQueue.set(userId, {
        userId: userId,
        gamertag: user.gamertag,
        trophies: user.trophies,
        socketId: socket.id,
        joinedAt: Date.now()
      });

      console.log(user.gamertag + ' rejoint la queue (' + matchmakingQueue.size + ' joueurs)');
      socket.emit('queue_joined', { position: matchmakingQueue.size });

      findMatch(userId);
    } catch (error) {
      console.error('Erreur join_queue:', error);
    }
  });

  socket.on('leave_queue', (userId) => {
    matchmakingQueue.delete(userId);
    console.log('Utilisateur ' + userId + ' quitte la queue');
  });

  socket.on('declare_result', async (data) => {
    try {
      const matchId = data.matchId;
      const userId = data.userId;
      const result = data.result;
      
      const match = await Match.findById(matchId);
      if (!match) return;

      const isPlayer1 = match.player1.toString() === userId;
      const isPlayer2 = match.player2.toString() === userId;

      if (!isPlayer1 && !isPlayer2) return;

      if (isPlayer1) {
        match.player1Declared = result;
      } else {
        match.player2Declared = result;
      }

      await match.save();

      if (match.player1Declared && match.player2Declared) {
        await resolveMatch(match);
      }
    } catch (error) {
      console.error('Erreur declare_result:', error);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      matchmakingQueue.delete(socket.userId);
      userSockets.delete(socket.userId);
    }
    console.log('Client deconnecte:', socket.id);
  });
});

// Fonctions de matchmaking
async function findMatch(userId) {
  const player = matchmakingQueue.get(userId);
  if (!player) return;

  var bestMatch = null;
  var bestDifference = Infinity;

  for (const [opponentId, opponent] of matchmakingQueue) {
    if (opponentId === userId) continue;

    const difference = Math.abs(player.trophies - opponent.trophies);
    const waitTime = Date.now() - player.joinedAt;
    const maxDifference = waitTime > 10000 ? Infinity : 200;

    if (difference < bestDifference && difference <= maxDifference) {
      bestMatch = { id: opponentId, userId: opponent.userId, gamertag: opponent.gamertag, trophies: opponent.trophies, socketId: opponent.socketId };
      bestDifference = difference;
    }
  }

  if (bestMatch) {
    createMatch(userId, player, bestMatch.id, bestMatch);
  }
}

async function createMatch(player1Id, player1Data, player2Id, player2Data) {
  try {
    matchmakingQueue.delete(player1Id);
    matchmakingQueue.delete(player2Id);

    const match = new Match({
      player1: player1Id,
      player2: player2Id
    });
    await match.save();

    const player1 = await User.findById(player1Id).select('-password');
    const player2 = await User.findById(player2Id).select('-password');

    const socket1 = io.sockets.sockets.get(player1Data.socketId);
    if (socket1) {
      socket1.emit('match_found', {
        matchId: match._id,
        opponent: {
          id: player2._id,
          gamertag: player2.gamertag,
          trophies: player2.trophies
        }
      });
    }

    const socket2 = io.sockets.sockets.get(player2Data.socketId);
    if (socket2) {
      socket2.emit('match_found', {
        matchId: match._id,
        opponent: {
          id: player1._id,
          gamertag: player1.gamertag,
          trophies: player1.trophies
        }
      });
    }

    console.log('Match cree: ' + player1.gamertag + ' VS ' + player2.gamertag);
  } catch (error) {
    console.error('Erreur createMatch:', error);
  }
}

async function resolveMatch(match) {
  try {
    const player1 = await User.findById(match.player1);
    const player2 = await User.findById(match.player2);

    var winner = null;
    var loser = null;

    if (
      (match.player1Declared === 'win' && match.player2Declared === 'loss') ||
      (match.player1Declared === 'loss' && match.player2Declared === 'win')
    ) {
      winner = match.player1Declared === 'win' ? player1 : player2;
      loser = match.player1Declared === 'win' ? player2 : player1;
      match.status = 'completed';
    } else {
      match.status = 'disputed';
      await match.save();
      notifyUser(player1._id, 'match_disputed', { matchId: match._id });
      notifyUser(player2._id, 'match_disputed', { matchId: match._id });
      return;
    }

    winner.trophies += 30;
    winner.wins += 1;
    loser.trophies = Math.max(0, loser.trophies - 30);
    loser.losses += 1;

    await winner.save();
    await loser.save();

    match.winner = winner._id;
    match.completedAt = new Date();
    await match.save();

    notifyUser(player1._id, 'match_resolved', {
      matchId: match._id,
      won: winner._id.toString() === player1._id.toString(),
      newTrophies: player1.trophies,
      trophyChange: winner._id.toString() === player1._id.toString() ? 30 : -30
    });

    notifyUser(player2._id, 'match_resolved', {
      matchId: match._id,
      won: winner._id.toString() === player2._id.toString(),
      newTrophies: player2.trophies,
      trophyChange: winner._id.toString() === player2._id.toString() ? 30 : -30
    });

    console.log('Match resolu: ' + winner.gamertag + ' bat ' + loser.gamertag);
  } catch (error) {
    console.error('Erreur resolveMatch:', error);
  }
}

function notifyUser(userId, event, data) {
  const socketId = userSockets.get(userId.toString());
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, function() {
  console.log('Serveur demarre sur le port ' + PORT);
});
