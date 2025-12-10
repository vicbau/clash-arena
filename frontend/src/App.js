import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import API_URL from './config';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('login');
  const [gamertag, setGamertag] = useState('');
  const [password, setPassword] = useState('');
  const [playerTag, setPlayerTag] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [searchingMatch, setSearchingMatch] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [users, setUsers] = useState([]);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('match_found', (data) => {
      setOpponent(data.opponent);
      setMatchId(data.matchId);
      setSearchingMatch(false);
    });

    socket.on('match_resolved', (data) => {
      setMatchResult(data.won ? 'victory' : 'defeat');
      setCurrentUser(prev => ({
        ...prev,
        trophies: data.newTrophies,
        wins: data.won ? prev.wins + 1 : prev.wins,
        losses: data.won ? prev.losses : prev.losses + 1
      }));
      setView('result');
      setWaitingForOpponent(false);
      setVerifying(false);
    });

    socket.on('match_disputed', () => {
      alert('Match conteste! Les resultats ne correspondent pas.');
      setView('home');
      setOpponent(null);
      setMatchId(null);
      setWaitingForOpponent(false);
    });

    return () => {
      socket.off('match_found');
      socket.off('match_resolved');
      socket.off('match_disputed');
    };
  }, [socket]);

  useEffect(() => {
    if (socket && currentUser) {
      socket.emit('register_user', currentUser.id);
    }
  }, [socket, currentUser]);

  useEffect(() => {
    const savedUser = localStorage.getItem('clash_arena_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      refreshUserData(user.id);
    }
  }, []);

  const refreshUserData = async (userId) => {
    try {
      const response = await fetch(API_URL + '/api/user/' + userId);
      if (response.ok) {
        const user = await response.json();
        setCurrentUser(user);
        localStorage.setItem('clash_arena_user', JSON.stringify(user));
        setView('home');
      } else {
        localStorage.removeItem('clash_arena_user');
      }
    } catch (err) {
      console.error('Erreur refresh:', err);
    }
  };

  const handleLogin = async () => {
    setError('');
    try {
      const response = await fetch(API_URL + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gamertag, password })
      });
      const data = await response.json();
      if (response.ok) {
        setCurrentUser(data);
        localStorage.setItem('clash_arena_user', JSON.stringify(data));
        setView('home');
        setGamertag('');
        setPassword('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    }
  };

  const handleRegister = async () => {
    setError('');
    try {
      const response = await fetch(API_URL + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gamertag, password, playerTag })
      });
      const data = await response.json();
      if (response.ok) {
        setCurrentUser(data);
        localStorage.setItem('clash_arena_user', JSON.stringify(data));
        setView('home');
        setGamertag('');
        setPassword('');
        setPlayerTag('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    }
  };

  const verifyMatch = async () => {
    if (!matchId || !currentUser) return;
    setVerifying(true);
    setError('');
    try {
      const response = await fetch(API_URL + '/api/verify-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, userId: currentUser.id })
      });
      const data = await response.json();
      if (response.ok && data.verified) {
        // Le match_resolved sera reçu via socket
      } else {
        setError(data.error || 'Impossible de verifier le match');
        setVerifying(false);
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('clash_arena_user');
    if (socket && currentUser) {
      socket.emit('leave_queue', currentUser.id);
    }
    setCurrentUser(null);
    setView('login');
  };

  const findMatch = () => {
    if (!socket || !currentUser) return;
    setSearchingMatch(true);
    setView('matchmaking');
    socket.emit('join_queue', currentUser.id);
  };

  const cancelSearch = () => {
    if (!socket || !currentUser) return;
    socket.emit('leave_queue', currentUser.id);
    setSearchingMatch(false);
    setView('home');
  };

  const declareResult = (won) => {
    if (!socket || !matchId || !currentUser) return;
    socket.emit('declare_result', {
      matchId: matchId,
      userId: currentUser.id,
      result: won ? 'win' : 'loss'
    });
    setWaitingForOpponent(true);
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(API_URL + '/api/leaderboard');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Erreur leaderboard:', err);
    }
  };

  const getTrophyRank = (trophies) => {
    if (trophies >= 2000) return { name: 'Champion', color: '#FFD700', icon: '👑' };
    if (trophies >= 1500) return { name: 'Master', color: '#E040FB', icon: '💎' };
    if (trophies >= 1200) return { name: 'Challenger', color: '#FF5722', icon: '🔥' };
    if (trophies >= 1000) return { name: 'Knight', color: '#2196F3', icon: '⚔️' };
    if (trophies >= 800) return { name: 'Builder', color: '#4CAF50', icon: '🏰' };
    return { name: 'Recruit', color: '#9E9E9E', icon: '🛡️' };
  };

  const renderLogin = () => (
    <div className="auth-container">
      <div className="logo">
        <span className="logo-icon">⚔️</span>
        <h1 className="logo-text">CLASH ARENA</h1>
        <p className="logo-subtext">Matchmaking Ladder</p>
      </div>
      <div className="auth-card">
        <h2 className="auth-title">Connexion</h2>
        <div className="input-group">
          <label className="label">Gamertag</label>
          <input type="text" value={gamertag} onChange={(e) => setGamertag(e.target.value)} placeholder="Ton pseudo" className="input" />
        </div>
        <div className="input-group">
          <label className="label">Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input" />
        </div>
        {error && <p className="error">{error}</p>}
        <button onClick={handleLogin} className="primary-button">ENTRER</button>
        <p className="switch-auth">Pas de compte ? <span onClick={() => { setView('register'); setError(''); }} className="link">Creer un compte</span></p>
      </div>
    </div>
  );

  const renderRegister = () => (
    <div className="auth-container">
      <div className="logo">
        <span className="logo-icon">⚔️</span>
        <h1 className="logo-text">CLASH ARENA</h1>
        <p className="logo-subtext">Rejoins le combat</p>
      </div>
      <div className="auth-card">
        <h2 className="auth-title">Inscription</h2>
        <div className="input-group">
          <label className="label">Gamertag</label>
          <input type="text" value={gamertag} onChange={(e) => setGamertag(e.target.value)} placeholder="Choisis ton pseudo" className="input" />
        </div>
        <div className="input-group">
          <label className="label">Tag Clash Royale</label>
          <input type="text" value={playerTag} onChange={(e) => setPlayerTag(e.target.value)} placeholder="#ABC123XYZ" className="input" />
          <p className="input-help">Trouve ton tag dans Clash Royale : Profil → sous ton nom</p>
        </div>
        <div className="input-group">
          <label className="label">Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input" />
        </div>
        {error && <p className="error">{error}</p>}
        <button onClick={handleRegister} className="primary-button">CREER MON COMPTE</button>
        <p className="switch-auth">Deja un compte ? <span onClick={() => { setView('login'); setError(''); }} className="link">Se connecter</span></p>
      </div>
    </div>
  );

  const renderHome = () => {
    if (!currentUser) return null;
    const rank = getTrophyRank(currentUser.trophies);
    return (
      <div className="home-container">
        <div className="header">
          <div className="header-left">
            <span className="header-icon">⚔️</span>
            <span className="header-title">CLASH ARENA</span>
          </div>
          <button onClick={handleLogout} className="logout-button">Deconnexion</button>
        </div>
        <div className="profile-card">
          <div className="profile-header">
            <div className="avatar">{currentUser.gamertag.charAt(0).toUpperCase()}</div>
            <div>
              <h2 className="profile-name">{currentUser.gamertag}</h2>
              <div className="rank-badge">
                <span>{rank.icon}</span>
                <span style={{ color: rank.color }}>{rank.name}</span>
              </div>
            </div>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <span className="stat-icon">🏆</span>
              <span className="stat-value">{currentUser.trophies}</span>
              <span className="stat-label">Trophees</span>
            </div>
            <div className="stat-box">
              <span className="stat-icon">✅</span>
              <span className="stat-value">{currentUser.wins}</span>
              <span className="stat-label">Victoires</span>
            </div>
            <div className="stat-box">
              <span className="stat-icon">❌</span>
              <span className="stat-value">{currentUser.losses}</span>
              <span className="stat-label">Defaites</span>
            </div>
          </div>
        </div>
        <div className="menu-buttons">
          <button onClick={findMatch} className="play-button">⚔️ TROUVER UN MATCH</button>
          <button onClick={() => { setView('ladder'); fetchLeaderboard(); }} className="ladder-button">🏆 CLASSEMENT</button>
        </div>
      </div>
    );
  };

  const renderMatchmaking = () => (
    <div className="matchmaking-container">
      {searchingMatch && !opponent ? (
        <div className="searching-box">
          <div className="searching-spinner"></div>
          <h2 className="searching-title">Recherche...</h2>
          <p className="searching-text">Recherche d'un adversaire</p>
          <button onClick={cancelSearch} className="cancel-button">Annuler</button>
        </div>
      ) : opponent ? (
        <div className="match-found-box">
          {verifying ? (
            <div className="waiting-box">
              <div className="searching-spinner"></div>
              <h2 className="searching-title">Verification...</h2>
              <p className="waiting-text">Verification du resultat via Clash Royale API</p>
            </div>
          ) : (
            <>
              <h2 className="match-found-title">ADVERSAIRE TROUVE !</h2>
              <div className="vs-container">
                <div className="player-card">
                  <div className="player-avatar">{currentUser.gamertag.charAt(0).toUpperCase()}</div>
                  <p className="player-name">{currentUser.gamertag}</p>
                  <p className="player-trophies">🏆 {currentUser.trophies}</p>
                </div>
                <div className="vs-text">VS</div>
                <div className="player-card">
                  <div className="player-avatar opponent">{opponent.gamertag.charAt(0).toUpperCase()}</div>
                  <p className="player-name">{opponent.gamertag}</p>
                  <p className="player-trophies">🏆 {opponent.trophies}</p>
                </div>
              </div>
              <div className="match-instructions-box">
                <p className="match-instructions">📱 Jouez votre match dans Clash Royale</p>
                <p className="match-instructions-sub">Ajoutez-vous en ami et faites un match amical,<br />puis cliquez sur le bouton ci-dessous.</p>
              </div>
              {error && <p className="error">{error}</p>}
              <button onClick={verifyMatch} className="verify-button">🔍 VERIFIER LE RESULTAT</button>
              <button onClick={() => { setView('home'); setOpponent(null); setMatchId(null); setError(''); }} className="cancel-button">Annuler</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  const renderResult = () => {
    const isVictory = matchResult === 'victory';
    return (
      <div className="result-container">
        <div className={`result-box ${isVictory ? 'victory' : 'defeat'}`}>
          <div className={`result-icon ${isVictory ? 'victory' : 'defeat'}`}>{isVictory ? '🏆' : '💔'}</div>
          <h1 className={`result-title ${isVictory ? 'victory' : 'defeat'}`}>{isVictory ? 'VICTOIRE !' : 'DEFAITE'}</h1>
          <div className={`trophy-change ${isVictory ? 'victory' : 'defeat'}`}>
            <span>{isVictory ? '+30' : '-30'}</span>
            <span>🏆</span>
          </div>
          <p className="new-trophies">Nouveau total : <strong>{currentUser?.trophies}</strong> trophees</p>
          <button onClick={() => { setView('home'); setOpponent(null); setMatchId(null); setMatchResult(null); setVerifying(false); setError(''); }} className="continue-button">CONTINUER</button>
        </div>
      </div>
    );
  };

  const renderLadder = () => {
    const currentUserRank = users.findIndex(u => u.id === currentUser?.id) + 1;
    return (
      <div className="ladder-container">
        <div className="ladder-header">
          <button onClick={() => setView('home')} className="back-button">← Retour</button>
          <h1 className="ladder-title">🏆 CLASSEMENT</h1>
        </div>
        {currentUser && (
          <div className="my-rank-card">
            <span>Ta position :</span>
            <span className="my-rank-number">#{currentUserRank || '?'}</span>
            <span className="my-rank-trophies">🏆 {currentUser.trophies}</span>
          </div>
        )}
        <div className="ladder-list">
          {users.map((user, index) => {
            const rank = getTrophyRank(user.trophies);
            const isCurrentUser = user.id === currentUser?.id;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
            return (
              <div key={user.id} className={`ladder-item ${isCurrentUser ? 'current-user' : ''}`}>
                <div className="ladder-rank">{medal || `#${index + 1}`}</div>
                <div className="ladder-player-info">
                  <span className="ladder-player-name">{user.gamertag}{isCurrentUser && <span className="you-badge">(toi)</span>}</span>
                  <span style={{ fontSize: '0.8rem', color: rank.color }}>{rank.icon} {rank.name}</span>
                </div>
                <div className="ladder-stats">
                  <span className="ladder-win-loss">{user.wins}V / {user.losses}D</span>
                  <span className="ladder-trophies">🏆 {user.trophies}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="background-overlay"></div>
      <div className="content">
        {view === 'login' && renderLogin()}
        {view === 'register' && renderRegister()}
        {view === 'home' && renderHome()}
        {view === 'matchmaking' && renderMatchmaking()}
        {view === 'result' && renderResult()}
        {view === 'ladder' && renderLadder()}
      </div>
    </div>
  );
}

export default App;
