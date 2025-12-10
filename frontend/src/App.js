import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import API_URL from './config';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('landing');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [gamertag, setGamertag] = useState('');
  const [password, setPassword] = useState('');
  const [playerTag, setPlayerTag] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [searchingMatch, setSearchingMatch] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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
      setView('match');
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
      setVerifying(false);
    });

    socket.on('match_disputed', () => {
      alert('Match contesté! Les résultats ne correspondent pas.');
      setView('dashboard');
      setOpponent(null);
      setMatchId(null);
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

  useEffect(() => {
    if (currentUser) {
      fetchLeaderboard();
    }
  }, [currentUser]);

  const refreshUserData = async (userId) => {
    try {
      const response = await fetch(API_URL + '/api/user/' + userId);
      if (response.ok) {
        const user = await response.json();
        setCurrentUser(user);
        localStorage.setItem('clash_arena_user', JSON.stringify(user));
        setView('dashboard');
      } else {
        localStorage.removeItem('clash_arena_user');
      }
    } catch (err) {
      console.error('Erreur refresh:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
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
        setView('dashboard');
        setShowAuthModal(false);
        resetForm();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
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
        setView('dashboard');
        setShowAuthModal(false);
        resetForm();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    }
  };

  const resetForm = () => {
    setGamertag('');
    setPassword('');
    setPlayerTag('');
    setError('');
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
      if (!response.ok || !data.verified) {
        setError(data.error || 'Impossible de vérifier le match');
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
    setView('landing');
  };

  const findMatch = () => {
    if (!socket || !currentUser) return;
    setSearchingMatch(true);
    setView('searching');
    socket.emit('join_queue', currentUser.id);
  };

  const cancelSearch = () => {
    if (!socket || !currentUser) return;
    socket.emit('leave_queue', currentUser.id);
    setSearchingMatch(false);
    setView('dashboard');
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(API_URL + '/api/leaderboard');
      const data = await response.json();
      setLeaderboard(data);
    } catch (err) {
      console.error('Erreur leaderboard:', err);
    }
  };

  const getRank = (trophies) => {
    if (trophies >= 2000) return { name: 'Champion', color: '#ffd700', icon: '👑' };
    if (trophies >= 1500) return { name: 'Master', color: '#e040fb', icon: '💎' };
    if (trophies >= 1200) return { name: 'Challenger', color: '#ff5722', icon: '🔥' };
    if (trophies >= 1000) return { name: 'Knight', color: '#2196f3', icon: '⚔️' };
    if (trophies >= 800) return { name: 'Builder', color: '#4caf50', icon: '🏰' };
    return { name: 'Recruit', color: '#9e9e9e', icon: '🛡️' };
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setShowAuthModal(true);
    resetForm();
  };

  // Landing Page
  const renderLanding = () => (
    <div className="landing">
      <nav className="navbar">
        <div className="nav-brand">
          <span className="nav-logo">⚔️</span>
          <span className="nav-title">CLASH ARENA</span>
        </div>
        <div className="nav-actions">
          <button className="btn-ghost" onClick={() => openAuth('login')}>Sign In</button>
          <button className="btn-primary" onClick={() => openAuth('register')}>Sign Up</button>
        </div>
      </nav>

      <main className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Compete. <span className="highlight">Climb.</span> Conquer.
          </h1>
          <p className="hero-subtitle">
            Le ladder compétitif pour Clash Royale. Affrontez des joueurs de votre niveau et grimpez dans le classement.
          </p>
          <div className="hero-actions">
            <button className="btn-large" onClick={() => openAuth('register')}>
              Commencer maintenant
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">{leaderboard.length}+</span>
              <span className="stat-label">Joueurs</span>
            </div>
            <div className="stat">
              <span className="stat-number">∞</span>
              <span className="stat-label">Matchs</span>
            </div>
            <div className="stat">
              <span className="stat-number">24/7</span>
              <span className="stat-label">Disponible</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="card-glow"></div>
            <span className="hero-icon">🏆</span>
          </div>
        </div>
      </main>
    </div>
  );

  // Auth Modal
  const renderAuthModal = () => (
    <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setShowAuthModal(false)}>×</button>

        <div className="modal-header">
          <h2>{authMode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
          <p>{authMode === 'login' ? 'Content de vous revoir!' : 'Rejoignez la compétition'}</p>
        </div>

        <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="auth-form">
          <div className="form-group">
            <label>Gamertag</label>
            <input
              type="text"
              value={gamertag}
              onChange={(e) => setGamertag(e.target.value)}
              placeholder="Votre pseudo"
              required
            />
          </div>

          {authMode === 'register' && (
            <div className="form-group">
              <label>Tag Clash Royale</label>
              <input
                type="text"
                value={playerTag}
                onChange={(e) => setPlayerTag(e.target.value)}
                placeholder="Ex: 9GCV09PUJ (sans #)"
                required
              />
              <span className="form-hint">Trouvez votre tag dans Clash Royale : Profil → sous votre nom</span>
            </div>
          )}

          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-submit">
            {authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <div className="modal-footer">
          {authMode === 'login' ? (
            <p>Pas de compte? <button className="btn-link" onClick={() => { setAuthMode('register'); resetForm(); }}>Créer un compte</button></p>
          ) : (
            <p>Déjà un compte? <button className="btn-link" onClick={() => { setAuthMode('login'); resetForm(); }}>Se connecter</button></p>
          )}
        </div>
      </div>
    </div>
  );

  // Dashboard
  const renderDashboard = () => {
    if (!currentUser) return null;
    const rank = getRank(currentUser.trophies);
    const userRankPosition = leaderboard.findIndex(u => u.id === currentUser.id) + 1;

    return (
      <div className="dashboard">
        <nav className="navbar navbar-dark">
          <div className="nav-brand">
            <span className="nav-logo">⚔️</span>
            <span className="nav-title">CLASH ARENA</span>
          </div>
          <div className="nav-actions">
            <span className="nav-user">{currentUser.gamertag}</span>
            <button className="btn-ghost" onClick={handleLogout}>Déconnexion</button>
          </div>
        </nav>

        <main className="dashboard-content">
          <div className="dashboard-grid">
            {/* Profile Card */}
            <div className="card profile-card">
              <div className="profile-header">
                <div className="profile-avatar">
                  {currentUser.gamertag.charAt(0).toUpperCase()}
                </div>
                <div className="profile-info">
                  <h2>{currentUser.gamertag}</h2>
                  <div className="profile-rank" style={{ color: rank.color }}>
                    <span>{rank.icon}</span>
                    <span>{rank.name}</span>
                  </div>
                </div>
              </div>
              <div className="profile-stats">
                <div className="profile-stat">
                  <span className="profile-stat-value">{currentUser.trophies}</span>
                  <span className="profile-stat-label">Trophées</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{currentUser.wins}</span>
                  <span className="profile-stat-label">Victoires</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{currentUser.losses}</span>
                  <span className="profile-stat-label">Défaites</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">
                    {currentUser.wins + currentUser.losses > 0
                      ? Math.round((currentUser.wins / (currentUser.wins + currentUser.losses)) * 100)
                      : 0}%
                  </span>
                  <span className="profile-stat-label">Winrate</span>
                </div>
              </div>
            </div>

            {/* Find Match Card */}
            <div className="card action-card">
              <div className="action-content">
                <span className="action-icon">⚔️</span>
                <h3>Prêt pour le combat?</h3>
                <p>Trouvez un adversaire de votre niveau et grimpez dans le classement</p>
                <button className="btn-action" onClick={findMatch}>
                  Trouver un match
                </button>
              </div>
            </div>

            {/* Rank Card */}
            <div className="card rank-card">
              <h3>Votre Classement</h3>
              <div className="rank-display">
                <span className="rank-position">#{userRankPosition || '?'}</span>
                <span className="rank-total">sur {leaderboard.length} joueurs</span>
              </div>
              <div className="rank-progress">
                <div className="rank-bar">
                  <div
                    className="rank-fill"
                    style={{
                      width: `${Math.min((currentUser.trophies / 2000) * 100, 100)}%`,
                      backgroundColor: rank.color
                    }}
                  ></div>
                </div>
                <span className="rank-next">
                  {currentUser.trophies < 2000
                    ? `${2000 - currentUser.trophies} trophées avant Champion`
                    : 'Rang maximum atteint!'}
                </span>
              </div>
            </div>

            {/* Leaderboard Card */}
            <div className="card leaderboard-card">
              <div className="leaderboard-header">
                <h3>Classement Global</h3>
              </div>
              <div className="leaderboard-list">
                {leaderboard.slice(0, 10).map((user, index) => {
                  const userRank = getRank(user.trophies);
                  const isCurrentUser = user.id === currentUser?.id;
                  return (
                    <div key={user.id} className={`leaderboard-item ${isCurrentUser ? 'current' : ''}`}>
                      <span className="lb-position">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                      <span className="lb-name">{user.gamertag}</span>
                      <span className="lb-rank" style={{ color: userRank.color }}>{userRank.icon}</span>
                      <span className="lb-trophies">{user.trophies}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  // Searching for Match
  const renderSearching = () => (
    <div className="fullscreen-view">
      <div className="searching-container">
        <div className="searching-spinner"></div>
        <h2>Recherche en cours...</h2>
        <p>Recherche d'un adversaire de votre niveau</p>
        <button className="btn-cancel" onClick={cancelSearch}>Annuler</button>
      </div>
    </div>
  );

  // Match View
  const renderMatch = () => (
    <div className="fullscreen-view">
      <div className="match-container">
        {verifying ? (
          <div className="verifying">
            <div className="searching-spinner"></div>
            <h2>Vérification...</h2>
            <p>Recherche du résultat via l'API Clash Royale</p>
          </div>
        ) : (
          <>
            <h2 className="match-title">Adversaire trouvé!</h2>

            <div className="match-versus">
              <div className="match-player">
                <div className="match-avatar">{currentUser?.gamertag.charAt(0).toUpperCase()}</div>
                <span className="match-name">{currentUser?.gamertag}</span>
                <span className="match-trophies">🏆 {currentUser?.trophies}</span>
              </div>

              <span className="match-vs">VS</span>

              <div className="match-player">
                <div className="match-avatar opponent">{opponent?.gamertag.charAt(0).toUpperCase()}</div>
                <span className="match-name">{opponent?.gamertag}</span>
                <span className="match-trophies">🏆 {opponent?.trophies}</span>
              </div>
            </div>

            <div className="match-instructions">
              <p>📱 Jouez votre match dans Clash Royale</p>
              <p className="match-hint">Ajoutez-vous en ami et faites un match amical</p>
            </div>

            {error && <div className="match-error">{error}</div>}

            <div className="match-actions">
              <button className="btn-verify" onClick={verifyMatch}>
                Vérifier le résultat
              </button>
              <button className="btn-cancel" onClick={() => { setView('dashboard'); setOpponent(null); setMatchId(null); setError(''); }}>
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Result View
  const renderResult = () => {
    const isVictory = matchResult === 'victory';
    return (
      <div className="fullscreen-view">
        <div className={`result-container ${isVictory ? 'victory' : 'defeat'}`}>
          <span className="result-icon">{isVictory ? '🏆' : '💔'}</span>
          <h1 className="result-title">{isVictory ? 'VICTOIRE!' : 'DÉFAITE'}</h1>
          <div className="result-trophies">
            <span className={isVictory ? 'positive' : 'negative'}>
              {isVictory ? '+30' : '-30'} 🏆
            </span>
          </div>
          <p className="result-total">Total: {currentUser?.trophies} trophées</p>
          <button className="btn-continue" onClick={() => {
            setView('dashboard');
            setOpponent(null);
            setMatchId(null);
            setMatchResult(null);
            setError('');
          }}>
            Continuer
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      {view === 'landing' && renderLanding()}
      {view === 'dashboard' && renderDashboard()}
      {view === 'searching' && renderSearching()}
      {view === 'match' && renderMatch()}
      {view === 'result' && renderResult()}
      {showAuthModal && renderAuthModal()}
    </div>
  );
}

export default App;
