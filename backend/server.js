require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const User = require('./models/User');
const Match = require('./models/Match');

// Configuration API Clash Royale
const CLASH_API_BASE = 'https://api.clashroyale.com/v1';
const CLASH_API_KEY = process.env.CLASH_ROYALE_API_KEY;

// Configuration du proxy Fixie pour IP statique
const FIXIE_URL = process.env.FIXIE_URL;
const proxyAgent = FIXIE_URL ? new HttpsProxyAgent(FIXIE_URL) : null;

// Logging de la configuration au démarrage
console.log('=== Configuration ===');
console.log('CLASH_API_KEY present:', !!CLASH_API_KEY);
console.log('FIXIE_URL present:', !!FIXIE_URL);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('MONGODB_URI present:', !!process.env.MONGODB_URI);
console.log('===================');

// Fonction pour appeler l'API Clash Royale (via proxy Fixie)
async function fetchClashAPI(endpoint) {
  if (!CLASH_API_KEY) {
    throw new Error('CLASH_ROYALE_API_KEY non configure');
  }

  console.log('Calling Clash API:', CLASH_API_BASE + endpoint);

  const fetchOptions = {
    headers: {
      'Authorization': 'Bearer ' + CLASH_API_KEY,
      'Accept': 'application/json'
    }
  };

  // Utiliser le proxy Fixie si disponible
  if (proxyAgent) {
    fetchOptions.agent = proxyAgent;
    console.log('Using Fixie proxy');
  }

  const response = await fetch(CLASH_API_BASE + endpoint, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Clash API Error:', response.status, errorText);

    // Messages d'erreur plus clairs
    if (response.status === 403) {
      throw new Error('API Key invalide ou IP non autorisee (403)');
    } else if (response.status === 404) {
      throw new Error('Joueur non trouve (404)');
    } else {
      throw new Error('Erreur API Clash: ' + response.status);
    }
  }
  return response.json();
}

// Fonction pour récupérer le battlelog d'un joueur
async function getPlayerBattleLog(playerTag) {
  // Le tag doit être encodé (# devient %23)
  const encodedTag = encodeURIComponent(playerTag);
  return fetchClashAPI('/players/' + encodedTag + '/battlelog');
}

// Fonction pour vérifier un match entre deux joueurs
async function verifyMatchResult(player1Tag, player2Tag) {
  try {
    const battleLog = await getPlayerBattleLog(player1Tag);

    // Chercher un match récent entre les deux joueurs (dans les 25 dernières batailles)
    for (const battle of battleLog) {
      // Vérifier si c'est un match 1v1
      if (battle.type === 'PvP' || battle.type === 'challenge' || battle.type === 'pathOfLegend') {
        const opponentTag = battle.opponent && battle.opponent[0] && battle.opponent[0].tag;

        if (opponentTag === player2Tag) {
          // Match trouvé ! Vérifier le résultat
          const player1Crowns = battle.team[0].crowns;
          const player2Crowns = battle.opponent[0].crowns;

          if (player1Crowns > player2Crowns) {
            return { found: true, winner: player1Tag, loser: player2Tag };
          } else if (player2Crowns > player1Crowns) {
            return { found: true, winner: player2Tag, loser: player1Tag };
          } else {
            return { found: true, winner: null, loser: null, draw: true };
          }
        }
      }
    }

    return { found: false };
  } catch (error) {
    console.error('Erreur verification match:', error);
    return { found: false, error: error.message };
  }
}

const app = express();
const server = http.createServer(app);

// Configuration CORS - plus permissive pour debug
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    // Autoriser les requêtes sans origin (comme les appels API directs)
    if (!origin) return callback(null, true);

    // Vérifier si l'origin est dans la liste
    if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin);
    callback(new Error('CORS non autorise'));
  },
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
  res.json({ message: 'Clash Arena API v2 is running!' });
});

// Route pour trouver l'IP du serveur
app.get('/api/server-ip', async (req, res) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    res.json({ serverIP: data.ip });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de recuperer l\'IP' });
  }
});

// Route de debug pour vérifier la config
app.get('/api/debug', async (req, res) => {
  const debugInfo = {
    hasApiKey: !!CLASH_API_KEY,
    apiKeyLength: CLASH_API_KEY ? CLASH_API_KEY.length : 0,
    hasFixieProxy: !!FIXIE_URL,
    frontendUrl: process.env.FRONTEND_URL,
    nodeVersion: process.version
  };

  // Tester l'API Clash avec un joueur connu
  try {
    const testTag = encodeURIComponent('#9QV9U982V');
    await fetchClashAPI('/players/' + testTag);
    debugInfo.clashApiStatus = 'OK';
  } catch (error) {
    debugInfo.clashApiStatus = 'ERROR: ' + error.message;
  }

  res.json(debugInfo);
});

// Vérifier un tag Clash Royale
app.get('/api/verify-player/:tag', async (req, res) => {
  try {
    let playerTag = req.params.tag;
    // Ajouter # si absent
    if (!playerTag.startsWith('#')) {
      playerTag = '#' + playerTag;
    }

    console.log('Verifying player tag:', playerTag);

    const encodedTag = encodeURIComponent(playerTag);
    const playerData = await fetchClashAPI('/players/' + encodedTag);

    console.log('Player found:', playerData.name);

    res.json({
      valid: true,
      name: playerData.name,
      tag: playerData.tag,
      trophies: playerData.trophies,
      arena: playerData.arena ? playerData.arena.name : 'Unknown'
    });
  } catch (error) {
    console.error('Erreur verification tag:', error.message);
    // Retourner le message d'erreur exact pour le debug
    res.status(400).json({ valid: false, error: error.message });
  }
});

// Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { gamertag, password, playerTag } = req.body;

    if (!gamertag || !password || !playerTag) {
      return res.status(400).json({ error: 'Gamertag, mot de passe et tag Clash Royale requis' });
    }
    if (gamertag.length < 3) {
      return res.status(400).json({ error: 'Le gamertag doit faire au moins 3 caracteres' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caracteres' });
    }

    // Formater le playerTag
    let formattedTag = playerTag.trim().toUpperCase();
    if (!formattedTag.startsWith('#')) {
      formattedTag = '#' + formattedTag;
    }

    // Vérifier que le tag existe dans Clash Royale
    try {
      const encodedTag = encodeURIComponent(formattedTag);
      await fetchClashAPI('/players/' + encodedTag);
    } catch (err) {
      console.error('Tag validation failed:', err.message);
      return res.status(400).json({ error: err.message });
    }

    const existingUser = await User.findOne({
      gamertag: { $regex: new RegExp('^' + gamertag + '$', 'i') }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Ce gamertag est deja pris' });
    }

    const existingTag = await User.findOne({ playerTag: formattedTag });
    if (existingTag) {
      return res.status(400).json({ error: 'Ce tag Clash Royale est deja utilise' });
    }

    const user = new User({ gamertag, password, playerTag: formattedTag });
    await user.save();

    res.status(201).json({
      id: user._id,
      gamertag: user.gamertag,
      playerTag: user.playerTag,
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
      playerTag: user.playerTag,
      trophies: user.trophies,
      wins: user.wins,
      losses: user.losses
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier automatiquement le résultat d'un match via l'API Clash Royale
app.post('/api/verify-match', async (req, res) => {
  try {
    const { matchId, userId } = req.body;

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match non trouve' });
    }

    const player1 = await User.findById(match.player1);
    const player2 = await User.findById(match.player2);

    if (!player1 || !player2) {
      return res.status(404).json({ error: 'Joueurs non trouves' });
    }

    // Vérifier le résultat via l'API Clash Royale
    const result = await verifyMatchResult(player1.playerTag, player2.playerTag);

    if (!result.found) {
      return res.status(400).json({
        verified: false,
        error: 'Match non trouve dans le battlelog. Jouez votre match dans Clash Royale puis reessayez.'
      });
    }

    if (result.draw) {
      return res.status(400).json({
        verified: false,
        error: 'Match nul detecte. Les matchs nuls ne comptent pas.'
      });
    }

    // Déterminer le gagnant
    const winnerId = result.winner === player1.playerTag ? player1._id : player2._id;
    const loserId = result.winner === player1.playerTag ? player2._id : player1._id;

    const winner = result.winner === player1.playerTag ? player1 : player2;
    const loser = result.winner === player1.playerTag ? player2 : player1;

    // Mettre à jour les scores
    winner.trophies += 30;
    winner.wins += 1;
    loser.trophies = Math.max(0, loser.trophies - 30);
    loser.losses += 1;

    await winner.save();
    await loser.save();

    // Mettre à jour le match
    match.winner = winnerId;
    match.status = 'completed';
    match.completedAt = new Date();
    await match.save();

    // Notifier les deux joueurs
    const isPlayer1Winner = winnerId.toString() === player1._id.toString();

    notifyUser(player1._id, 'match_resolved', {
      matchId: match._id,
      won: isPlayer1Winner,
      newTrophies: player1.trophies,
      trophyChange: isPlayer1Winner ? 30 : -30
    });

    notifyUser(player2._id, 'match_resolved', {
      matchId: match._id,
      won: !isPlayer1Winner,
      newTrophies: player2.trophies,
      trophyChange: !isPlayer1Winner ? 30 : -30
    });

    res.json({
      verified: true,
      winner: winner.gamertag,
      loser: loser.gamertag,
      yourResult: userId === winnerId.toString() ? 'win' : 'loss'
    });

    console.log('Match verifie automatiquement: ' + winner.gamertag + ' bat ' + loser.gamertag);

  } catch (error) {
    console.error('Erreur verification match:', error);
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
      playerTag: user.playerTag,
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
