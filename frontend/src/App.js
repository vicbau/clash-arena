import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import API_URL from './config';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('landing');
  const [activeTab, setActiveTab] = useState('play');
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
  const [matchHistory, setMatchHistory] = useState([]);

  // Play match found audio with fallbacks
  const playMatchFoundAudio = () => {
    const audio = new Audio('/match-found.ogg');
    audio.volume = 0.7;
    audio.play().catch(() => {
      const audioWav = new Audio('/match-found.wav');
      audioWav.volume = 0.7;
      audioWav.play().catch(() => {
        const audioMp3 = new Audio('/match-found.mp3');
        audioMp3.volume = 0.7;
        audioMp3.play().catch(e => console.log('Audio failed:', e));
      });
    });
  };

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('match_found', (data) => {
      setSearchingMatch(false);
      playMatchFoundAudio();
      setOpponent(data.opponent);
      setMatchId(data.matchId);
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
      alert('Match contested! Results do not match.');
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
      console.error('Refresh error:', err);
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
      setError('Server connection error');
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
      setError('Server connection error');
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
        setError(data.error || 'Unable to verify match');
        setVerifying(false);
      }
    } catch (err) {
      setError('Server connection error');
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
      console.error('Leaderboard error:', err);
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

  // Generate friend invite link
  const getInviteLink = (tag) => {
    const cleanTag = tag.replace('#', '');
    return `https://link.clashroyale.com/invite/friend/fr/?platform=android&tag=${cleanTag}&token=f8bebprs`;
  };

  // Generate QR code URL
  const getQRCodeUrl = (url) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
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
            Tired of evos / <span className="highlight">Level 16</span> cards?
          </h1>
          <p className="hero-subtitle">
            Compete against players in classic mode like in the good old days with a competitive leaderboard
          </p>
          <div className="hero-actions">
            <button className="btn-large" onClick={() => openAuth('register')}>
              Start now
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="card-glow"></div>
            <img src="/king-clash.png" alt="Clash King" className="hero-king-image" />
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
          <h2>{authMode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <p>{authMode === 'login' ? 'Welcome back!' : 'Join the competition'}</p>
        </div>

        <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="auth-form">
          <div className="form-group">
            <label>Gamertag</label>
            <input
              type="text"
              value={gamertag}
              onChange={(e) => setGamertag(e.target.value)}
              placeholder="Your username"
              required
            />
          </div>

          {authMode === 'register' && (
            <div className="form-group">
              <label>Clash Royale Tag</label>
              <input
                type="text"
                value={playerTag}
                onChange={(e) => setPlayerTag(e.target.value)}
                placeholder="Ex: 9GCV09PUJ (without #)"
                required
              />
              <span className="form-hint">Find your tag in Clash Royale: Profile → under your name</span>
            </div>
          )}

          <div className="form-group">
            <label>Password</label>
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
            {authMode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="modal-footer">
          {authMode === 'login' ? (
            <p>No account? <button className="btn-link" onClick={() => { setAuthMode('register'); resetForm(); }}>Create one</button></p>
          ) : (
            <p>Already have an account? <button className="btn-link" onClick={() => { setAuthMode('login'); resetForm(); }}>Sign In</button></p>
          )}
        </div>
      </div>
    </div>
  );

  // Sidebar component
  const Sidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span>⚔️</span>
        <span className="sidebar-title">CLASH ARENA</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${activeTab === 'play' ? 'active' : ''}`}
          onClick={() => setActiveTab('play')}
        >
          <span className="sidebar-icon">▶</span>
          <span>Play</span>
        </button>
        <button
          className={`sidebar-item ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="sidebar-icon">🏆</span>
          <span>Leaderboard</span>
        </button>
        <button
          className={`sidebar-item ${activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('track')}
        >
          <span className="sidebar-icon">📊</span>
          <span>Track</span>
        </button>
        <button
          className={`sidebar-item ${activeTab === 'cards' ? 'active' : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          <span className="sidebar-icon">🃏</span>
          <span>Cards</span>
        </button>
        <button
          className={`sidebar-item ${activeTab === 'news' ? 'active' : ''}`}
          onClick={() => setActiveTab('news')}
        >
          <span className="sidebar-icon">📰</span>
          <span>News</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{currentUser?.gamertag.charAt(0).toUpperCase()}</div>
          <span>{currentUser?.gamertag}</span>
        </div>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </div>
    </aside>
  );

  // Dashboard - Play Tab
  const renderPlayTab = () => {
    const rank = getRank(currentUser.trophies);
    const userRankPosition = leaderboard.findIndex(u => u.id === currentUser.id) + 1;
    const totalGames = currentUser.wins + currentUser.losses;
    const winRate = totalGames > 0 ? Math.round((currentUser.wins / totalGames) * 100) : 0;

    return (
      <div className="tab-content">
        <div className="play-grid-new">
          {/* Top Row: Profile + Find Match */}
          <div className="play-top-row">
            {/* Quick Stats */}
            <div className="card quick-stats-compact">
              <div className="quick-stats-header">
                <div className="profile-avatar-large">{currentUser.gamertag.charAt(0).toUpperCase()}</div>
                <div>
                  <h2>{currentUser.gamertag}</h2>
                  <div className="profile-rank" style={{ color: rank.color }}>
                    {rank.icon} {rank.name}
                  </div>
                </div>
              </div>
              <div className="quick-stats-grid">
                <div className="quick-stat">
                  <span className="quick-stat-value">{currentUser.trophies}</span>
                  <span className="quick-stat-label">Trophies</span>
                </div>
                <div className="quick-stat">
                  <span className="quick-stat-value">{currentUser.wins}</span>
                  <span className="quick-stat-label">Wins</span>
                </div>
                <div className="quick-stat">
                  <span className="quick-stat-value">{currentUser.losses}</span>
                  <span className="quick-stat-label">Losses</span>
                </div>
              </div>
            </div>

            {/* Find Match */}
            <div className="card action-card-compact">
              <div className="action-content">
                <span className="action-icon-large">⚔️</span>
                <h3>Ready for battle?</h3>
                <p>Find an opponent at your level</p>
                <button className="btn-action-large" onClick={findMatch}>
                  Find Match
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Leaderboard Mini + Track Mini */}
          <div className="play-bottom-row">
            {/* Mini Leaderboard */}
            <div className="card mini-card" onClick={() => setActiveTab('leaderboard')}>
              <div className="mini-card-header">
                <span className="mini-card-icon">🏆</span>
                <h3>Leaderboard</h3>
              </div>
              <div className="mini-card-content">
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Your Rank</span>
                  <span className="mini-stat-value highlight">#{userRankPosition || '?'}</span>
                </div>
                <div className="mini-leaderboard-preview">
                  {leaderboard.slice(0, 3).map((user, index) => (
                    <div key={user.id} className={`mini-lb-item ${user.id === currentUser.id ? 'current' : ''}`}>
                      <span className="mini-lb-pos">{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
                      <span className="mini-lb-name">{user.gamertag}</span>
                      <span className="mini-lb-trophies">{user.trophies}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mini-card-footer">
                <span>View Full Leaderboard →</span>
              </div>
            </div>

            {/* Mini Track */}
            <div className="card mini-card" onClick={() => setActiveTab('track')}>
              <div className="mini-card-header">
                <span className="mini-card-icon">📊</span>
                <h3>Track</h3>
              </div>
              <div className="mini-card-content">
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Win Rate</span>
                  <span className={`mini-stat-value ${winRate >= 50 ? 'positive' : 'negative'}`}>{winRate}%</span>
                </div>
                <div className="mini-stat-row">
                  <span className="mini-stat-label">Total Matches</span>
                  <span className="mini-stat-value">{totalGames}</span>
                </div>
                <div className="mini-progress-bar">
                  <div className="mini-progress-fill wins" style={{ width: `${totalGames > 0 ? (currentUser.wins / totalGames) * 100 : 50}%` }}></div>
                  <div className="mini-progress-fill losses" style={{ width: `${totalGames > 0 ? (currentUser.losses / totalGames) * 100 : 50}%` }}></div>
                </div>
                <div className="mini-wl-legend">
                  <span className="wins-text">W: {currentUser.wins}</span>
                  <span className="losses-text">L: {currentUser.losses}</span>
                </div>
              </div>
              <div className="mini-card-footer">
                <span>View Full Stats →</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard - Leaderboard Tab
  const renderLeaderboardTab = () => {
    const userRankPosition = leaderboard.findIndex(u => u.id === currentUser.id) + 1;
    return (
      <div className="tab-content">
        <div className="leaderboard-full">
          <div className="leaderboard-your-rank">
            <span>Your Position</span>
            <span className="your-rank-number">#{userRankPosition || '?'}</span>
          </div>
          <div className="leaderboard-list-full">
            {leaderboard.map((user, index) => {
              const userRank = getRank(user.trophies);
              const isCurrentUser = user.id === currentUser?.id;
              return (
                <div key={user.id} className={`leaderboard-item-full ${isCurrentUser ? 'current' : ''}`}>
                  <span className="lb-position-full">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </span>
                  <div className="lb-player">
                    <span className="lb-name-full">{user.gamertag}</span>
                    <span className="lb-rank-badge" style={{ color: userRank.color }}>{userRank.icon} {userRank.name}</span>
                  </div>
                  <div className="lb-stats">
                    <span className="lb-record">{user.wins}W / {user.losses}L</span>
                    <span className="lb-trophies-full">🏆 {user.trophies}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Dashboard - Track Tab
  const [chartHover, setChartHover] = useState({ show: false, x: 0, y: 0, value: 0, index: 0 });

  // Memoize progression data to prevent regeneration on every hover
  const progressionData = useMemo(() => {
    if (!currentUser) return [{ match: 0, trophies: 1000 }];

    const data = [];
    const startTrophies = 1000;
    let currentTrophies = startTrophies;
    const totalMatches = currentUser.wins + currentUser.losses;

    if (totalMatches === 0) {
      return [{ match: 0, trophies: currentUser.trophies }];
    }

    // Use a seeded approach for consistent random values
    const winRatio = currentUser.wins / totalMatches;

    // Create a deterministic pattern based on wins/losses
    const wins = currentUser.wins;
    const losses = currentUser.losses;
    const pattern = [];

    // Distribute wins and losses evenly with some variation
    for (let i = 0; i < totalMatches; i++) {
      const expectedWins = Math.round((i + 1) * winRatio);
      const currentWins = pattern.filter(x => x).length;
      pattern.push(currentWins < expectedWins);
    }

    for (let i = 0; i <= totalMatches; i++) {
      data.push({ match: i, trophies: currentTrophies });
      if (i < totalMatches) {
        const isWin = pattern[i];
        currentTrophies += isWin ? 30 : -30;
        currentTrophies = Math.max(0, currentTrophies);
      }
    }

    // Adjust the last point to match current trophies
    if (data.length > 0) {
      data[data.length - 1].trophies = currentUser.trophies;
    }

    return data;
  }, [currentUser?.wins, currentUser?.losses, currentUser?.trophies]);

  const renderTrackTab = () => {
    const rank = getRank(currentUser.trophies);
    const totalGames = currentUser.wins + currentUser.losses;
    const winRate = totalGames > 0 ? Math.round((currentUser.wins / totalGames) * 100) : 0;
    const userRankPosition = leaderboard.findIndex(u => u.id === currentUser.id) + 1;
    const trophiesWon = currentUser.wins * 30;
    const trophiesLost = currentUser.losses * 30;
    const netTrophies = trophiesWon - trophiesLost;
    const maxTrophies = Math.max(...progressionData.map(d => d.trophies), currentUser.trophies + 100);
    const minTrophies = Math.min(...progressionData.map(d => d.trophies), currentUser.trophies - 100);
    const trophyRange = maxTrophies - minTrophies || 100;

    // Generate SVG path for the curve
    const generatePath = () => {
      if (progressionData.length < 2) return '';

      const width = 100;
      const height = 100;
      const padding = 5;

      const points = progressionData.map((d, i) => {
        const x = padding + ((width - 2 * padding) * i / (progressionData.length - 1));
        const y = height - padding - ((height - 2 * padding) * (d.trophies - minTrophies) / trophyRange);
        return { x, y };
      });

      // Create smooth curve
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        path += ` Q ${prev.x + (curr.x - prev.x) / 3} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
        path += ` Q ${curr.x - (curr.x - prev.x) / 3} ${curr.y}, ${curr.x} ${curr.y}`;
      }

      return path;
    };

    // Generate area path (for fill under curve)
    const generateAreaPath = () => {
      if (progressionData.length < 2) return '';

      const width = 100;
      const height = 100;
      const padding = 5;

      const points = progressionData.map((d, i) => {
        const x = padding + ((width - 2 * padding) * i / (progressionData.length - 1));
        const y = height - padding - ((height - 2 * padding) * (d.trophies - minTrophies) / trophyRange);
        return { x, y };
      });

      let path = `M ${points[0].x} ${height - padding}`;
      path += ` L ${points[0].x} ${points[0].y}`;

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        path += ` Q ${prev.x + (curr.x - prev.x) / 3} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
        path += ` Q ${curr.x - (curr.x - prev.x) / 3} ${curr.y}, ${curr.x} ${curr.y}`;
      }

      path += ` L ${points[points.length - 1].x} ${height - padding}`;
      path += ' Z';

      return path;
    };

    const handleChartHover = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relativeX = x / rect.width;
      const index = Math.min(Math.round(relativeX * (progressionData.length - 1)), progressionData.length - 1);
      const dataPoint = progressionData[index];

      if (dataPoint) {
        const padding = 5;
        const yPos = 100 - padding - ((100 - 2 * padding) * (dataPoint.trophies - minTrophies) / trophyRange);
        setChartHover({
          show: true,
          x: (index / (progressionData.length - 1)) * 100,
          y: yPos,
          value: dataPoint.trophies,
          index: index
        });
      }
    };

    const handleChartLeave = () => {
      setChartHover({ show: false, x: 0, y: 0, value: 0, index: 0 });
    };

    // Y-axis labels
    const yAxisLabels = [
      { value: maxTrophies, pos: 5 },
      { value: Math.round((maxTrophies + minTrophies) / 2), pos: 50 },
      { value: minTrophies, pos: 95 }
    ];

    // X-axis labels
    const xAxisLabels = [];
    const step = Math.max(1, Math.floor(progressionData.length / 5));
    for (let i = 0; i < progressionData.length; i += step) {
      xAxisLabels.push({ value: i, pos: (i / (progressionData.length - 1)) * 100 });
    }
    if (progressionData.length > 1 && xAxisLabels[xAxisLabels.length - 1]?.value !== progressionData.length - 1) {
      xAxisLabels.push({ value: progressionData.length - 1, pos: 100 });
    }

    return (
      <div className="tab-content">
        <div className="track-container">
          {/* Performance Section */}
          <section className="track-section">
            <h2 className="section-title">Performance</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span className={`stat-value ${winRate >= 50 ? 'positive' : 'negative'}`}>{winRate}%</span>
                  <span className={`stat-change ${winRate >= 50 ? 'up' : 'down'}`}>
                    {winRate >= 50 ? '↑' : '↓'} {Math.abs(winRate - 50)}%
                  </span>
                </div>
                <span className="stat-name">Win Rate</span>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${winRate}%`, backgroundColor: winRate >= 50 ? '#22c55e' : '#ef4444' }}></div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-value">{currentUser.trophies}</span>
                </div>
                <span className="stat-name">Current Trophies</span>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${Math.min((currentUser.trophies / 2000) * 100, 100)}%`, backgroundColor: rank.color }}></div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-value">#{userRankPosition || '?'}</span>
                </div>
                <span className="stat-name">Leaderboard Rank</span>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${Math.min((1 / userRankPosition) * 100 * 10, 100)}%`, backgroundColor: '#6366f1' }}></div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-value">{totalGames}</span>
                </div>
                <span className="stat-name">Matches Played</span>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${Math.min(totalGames * 2, 100)}%`, backgroundColor: '#8b5cf6' }}></div>
                </div>
              </div>
            </div>
          </section>

          {/* Progress Section */}
          <section className="track-section">
            <h2 className="section-title">Progress</h2>
            <div className="progress-container">
              <div className="progress-chart-wrapper">
                {/* Y-axis labels */}
                <div className="chart-y-axis">
                  {yAxisLabels.map((label, i) => (
                    <span key={i} className="axis-label" style={{ top: `${label.pos}%` }}>{label.value}</span>
                  ))}
                </div>

                {/* Chart */}
                <div
                  className="progress-chart"
                  onMouseMove={handleChartHover}
                  onMouseLeave={handleChartLeave}
                >
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
                    {/* Grid lines */}
                    <line x1="5" y1="5" x2="5" y2="95" stroke="#2a2a3a" strokeWidth="0.3"/>
                    <line x1="5" y1="95" x2="95" y2="95" stroke="#2a2a3a" strokeWidth="0.3"/>
                    <line x1="5" y1="50" x2="95" y2="50" stroke="#2a2a3a" strokeWidth="0.2" strokeDasharray="2"/>

                    {/* Area fill */}
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4"/>
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d={generateAreaPath()} fill="url(#areaGradient)"/>

                    {/* Main curve */}
                    <path d={generatePath()} fill="none" stroke="#6366f1" strokeWidth="0.8"/>

                    {/* Hover elements */}
                    {chartHover.show && (
                      <>
                        {/* Vertical line */}
                        <line
                          x1={5 + (chartHover.x / 100) * 90}
                          y1="5"
                          x2={5 + (chartHover.x / 100) * 90}
                          y2="95"
                          stroke="#fff"
                          strokeWidth="0.3"
                          strokeDasharray="1"
                        />
                        {/* Point */}
                        <circle
                          cx={5 + (chartHover.x / 100) * 90}
                          cy={chartHover.y}
                          r="1.5"
                          fill="#fff"
                          stroke="#6366f1"
                          strokeWidth="0.5"
                        />
                      </>
                    )}
                  </svg>

                  {/* Tooltip */}
                  {chartHover.show && (
                    <div
                      className="chart-tooltip"
                      style={{
                        left: `${5 + (chartHover.x / 100) * 90}%`,
                        top: `${chartHover.y}%`
                      }}
                    >
                      <span className="tooltip-value">{chartHover.value}</span>
                      <span className="tooltip-match">{chartHover.index}</span>
                    </div>
                  )}
                </div>

                {/* X-axis labels */}
                <div className="chart-x-axis">
                  {xAxisLabels.map((label, i) => (
                    <span key={i} className="axis-label" style={{ left: `${5 + (label.pos / 100) * 90}%` }}>{label.value}</span>
                  ))}
                </div>
              </div>

              <div className="progress-stats">
                <div className="progress-stat">
                  <span className={`progress-value ${netTrophies >= 0 ? 'positive' : 'negative'}`}>
                    {netTrophies >= 0 ? '+' : ''}{netTrophies}
                  </span>
                  <span className="progress-label">Net Trophies</span>
                </div>
                <div className="progress-stat">
                  <span className="progress-value">{currentUser.trophies}</span>
                  <span className="progress-label">Current</span>
                </div>
                <div className="progress-stat">
                  <span className="progress-value positive">+{trophiesWon}</span>
                  <span className="progress-label">Trophies Won</span>
                </div>
                <div className="progress-stat">
                  <span className="progress-value negative">-{trophiesLost}</span>
                  <span className="progress-label">Trophies Lost</span>
                </div>
                <div className="progress-stat wins-losses">
                  <span className="wins-indicator">W {currentUser.wins}</span>
                  <span className="losses-indicator">L {currentUser.losses}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  };

  // Card image mapping
  const cardImageMap = {
    'Mega Knight': 'MegaKnight.webp',
    'Battle Ram': 'BattleRam.webp',
    'Electro Giant': 'ElectroGiant.webp',
    'Giant': 'Giant.webp',
    'Goblin Giant': 'GoblinGiant.webp',
    'Royal Hogs': 'RoyalHogs.webp',
    'Hog Rider': 'HogRider.webp',
    'Golem': 'Golem.webp',
    'Royal Giant': 'RG.webp',
    'Ram Rider': 'Ram.webp',
    'Elixir Golem': 'ElixirGolem.webp',
    'Goblin Barrel': 'GoblinBarrel.webp',
    'Balloon': 'Balloon.webp',
    'Wall Breakers': 'WallBreakers.webp',
    'Mortar': 'Mortar.webp',
    'Goblin Drill': 'GoblinDrill.webp',
    'X-Bow': 'XBOW.webp',
    'Lava Hound': 'Lava.webp',
    'Graveyard': 'GraveYard.webp',
    'Royal Delivery': 'RoyalDelivery.webp',
    'The Log': 'Log.webp',
    'Barbarian Barrel': 'BarbBarrel.webp',
    'Arrows': 'Arrows.webp',
    'Zap': 'Zap.webp',
    'Goblin Curse': 'GoblinCurse.webp',
    'Giant Snowball': 'Snowball.webp',
    'Void': 'Void.webp',
    'Tornado': 'Tornado.webp',
    'Lightning': 'Lightning.webp',
    'Fireball': 'Fireball.webp',
    'Poison': 'Poison.webp',
    'Freeze': 'Freeze.webp',
    'Earthquake': 'Earthquake.webp',
    'Rocket': 'Rocket.webp',
    'Musketeer': 'Musk.webp',
    'Minion Horde': 'MM.webp',
    'Witch': 'Witch.webp',
    'Zappies': 'Zapper.webp',
    'Executioner': 'Executioner.webp',
    'Electro Wizard': 'ElectroWiz.webp',
    'Baby Dragon': 'BabyD.webp',
    'Hunter': 'Hunter.webp',
    'Skeleton Dragons': 'SkeletonDragons.webp',
    'Wizard': 'Wiz.webp',
    'Phoenix': 'Phoenix.webp',
    'Magic Archer': 'MagicArcher.webp',
    'Electro Dragon': 'ElectroDragon.webp',
    'Inferno Dragon': 'Inferno.webp',
    'Dart Goblin': 'DartGob.webp',
    'Firecracker': 'Firecracker.webp',
    'Flying Machine': 'FlyingMachine.webp',
    'Minions': 'Minions.webp',
    'Archers': 'Archers.webp',
    'Bats': 'Bats.webp',
    'Mega Minion': 'MegaMinion.webp',
    'Ice Wizard': 'IceWiz.webp',
    'Spear Goblins': 'SpearGobs.webp',
    'Princess': 'Princess.webp',
    'Cannon Cart': 'CannonCart.webp',
    'Bowler': 'Bowler.webp',
    'Bandit': 'Bandit.webp',
    'Goblin Demolisher': 'GoblinKnight.webp',
    'Sparky': 'Sparky.webp',
    'Bomber': 'Bomber.webp',
    'Mother Witch': 'MotherWitch.webp',
    'Night Witch': 'NightWitch.webp',
    'Rage': 'Rage.webp',
    'Elixir Collector': 'Pump.webp',
    'Elite Barbarians': 'EliteBarbs.webp',
    'Royal Recruits': 'RoyalRecruit.webp',
    'Mini P.E.K.K.A': 'MP.webp',
    'Lumberjack': 'Lumberjack.webp',
    'P.E.K.K.A': 'PEKKA.webp',
    'Goblin Cage': 'GoblinCage.webp',
    'Furnace': 'Furnace.webp',
    'Goblin Hut': 'GoblinHut.webp',
    'Bomb Tower': 'BombTower.webp',
    'Barbarians': 'Barbs.webp',
    'Cannon': 'Cannon.webp',
    'Barbarian Hut': 'BarbHut.webp',
    'Tesla': 'Tesla.webp',
    'Inferno Tower': 'InfernoTower.webp',
    'Rascals': 'Rascals.webp',
    'Prince': 'Prince.webp',
    'Dark Prince': 'DarkPrince.webp',
    'Knight': 'Knight.webp',
    'Valkyrie': 'Valk.webp',
    'Royal Ghost': 'Ghost.webp',
    'Goblin Machine': 'GoblinMachine.webp',
    'Battle Healer': 'BattleHealer.webp',
    'Ice Golem': 'IceGolem.webp',
    'Fisherman': 'Fisherman.webp',
    'Miner': 'Miner.webp',
    'Goblin Gang': 'GoblinGang.webp',
    'Guards': 'Guards.webp',
    'Skeleton Barrel': 'SkellyBarrel.webp',
    'Electro Spirit': 'ElectroSpirit.webp',
    'Fire Spirit': 'FireSpirit.webp',
    'Ice Spirit': 'IceSpirit.webp',
    'Goblins': 'Goblins.webp',
    'Tombstone': 'Tombstone.webp',
    'Skeleton Army': 'SkellyArmy.webp',
    'Skeletons': 'Skeletons.webp',
    'Heal Spirit': 'HealSpirit.webp',
    'Three Musketeers': '3M.webp',
    'Archer Queen': 'ArchQueen.webp',
    'Golden Knight': 'GoldenKnight.webp',
    'Skeleton King': 'SkeletonKing.webp',
    'Mighty Miner': 'MightyMiner.webp',
    'Little Prince': 'LittlePrince.webp',
    'Giant Skeleton': 'GiantSkelly.webp',
    'Clone': 'Clone.webp',
    'Mirror': 'Mirror.webp',
    'Vines': 'Vipers.webp',
    'Suspicious Bush': 'SupiciousBank.webp',
    // Evolution cards
    'Zap Evolution': 'Zap.evo.webp',
    'Skeleton Barrel Evolution': 'SkellyBarrel.evo.webp',
    'Mortar Evolution': 'Mortar.evo.webp',
    'Baby Dragon Evolution': 'BabyD.evo.webp',
    'Witch Evolution': 'Witch.evo.webp',
    'Royal Ghost Evolution': 'Ghost.evo.webp',
    'Battle Ram Evolution': 'BattleRam.evo.webp',
    'Electro Dragon Evolution': 'ElectroDragon.evo.webp',
    'Skeleton Army Evolution': 'Skeletons.evo.webp',
    'Inferno Dragon Evolution': 'Inferno.evo.webp',
    'Wizard Evolution': 'Wiz.evo.webp',
    'Royal Hogs Evolution': 'RoyalHogs.evo.webp',
    'Goblin Cage Evolution': 'GoblinCage.evo.webp',
    'Lumberjack Evolution': 'Lumberjack.evo.webp',
    'Furnace Evolution': 'Furnace.evo.webp',
    'Goblin Giant Evolution': 'GoblinGiant.evo.webp',
    'Bats Evolution': 'Bats.evo.webp',
    'Valkyrie Evolution': 'Valk.evo.webp',
    'Royal Giant Evolution': 'RG.evo.webp',
    'Giant Snowball Evolution': 'Snowball.evo.webp',
    'Bomber Evolution': 'Bomber.evo.webp',
    'Hunter Evolution': 'Hunter.evo.webp',
    'Musketeer Evolution': 'Musk.evo.webp',
    'Goblin Drill Evolution': 'GoblinDrill.evo.webp',
    'Wall Breakers Evolution': 'WallBreakers.evo.webp',
    'Archers Evolution': 'Archers.evo.webp',
    'Firecracker Evolution': 'Firecracker.evo.webp',
    'Skeletons Evolution': 'Skeletons.evo.webp',
    'P.E.K.K.A Evolution': 'PEKKA.evo.webp',
    'Dart Goblin Evolution': 'DartGob.evo.webp',
    'Goblin Barrel Evolution': 'GoblinBarrel.evo.webp',
    'Tesla Evolution': 'Tesla.evo.webp',
    'Cannon Evolution': 'Cannon.evo.webp',
    'Knight Evolution': 'Knight.evo.webp',
    'Ice Spirit Evolution': 'IceSpirit.evo.webp',
    'Mega Knight Evolution': 'MegaKnight.evo.webp',
    'Executioner Evolution': 'Executioner.evo.webp',
    'Royal Recruits Evolution': 'RoyalRecruit.evo.webp',
    'Barbarians Evolution': 'Barbs.evo.webp',
    // Heroes
    'Hero Giant': 'Giant.webp',
    'Hero Mini P.E.K.K.A': 'MP.webp',
    'Hero Musketeer': 'Musk.webp',
    'Hero Knight': 'Knight.webp',
    // Special cards
    'Dagger Duchess': 'DaggerDuchess.webp',
    'Cannoneer': 'Cannoneer.webp',
    'Spirit Empress': 'SpiritEspinense.webp',
    'Boss Bandit': 'Bandit.webp',
    'Monk': 'Monk.webp',
    'Berserker': 'Berserker.webp',
    'Royal Chef': 'RoyalChef.webp',
    'Goblinstein': 'Goblinstein.webp',
    'Rune Giant': 'RuneGiant.webp',
    'Tower Princess': 'TowerPrincess.webp'
  };

  // Static Triple Draft data
  const tripleDraftData = [
    { name: 'Mega Knight', rating: 69, usage: 11, win: 57 },
    { name: 'Battle Ram', rating: 58, usage: 5, win: 54 },
    { name: 'Electro Giant', rating: 55, usage: 5, win: 53 },
    { name: 'Giant', rating: 55, usage: 3, win: 52 },
    { name: 'Goblin Giant', rating: 52, usage: 3, win: 51 },
    { name: 'Royal Hogs', rating: 52, usage: 8, win: 51 },
    { name: 'Hog Rider', rating: 52, usage: 10, win: 51 },
    { name: 'Golem', rating: 50, usage: 4, win: 50 },
    { name: 'Royal Giant', rating: 49, usage: 5, win: 50 },
    { name: 'Ram Rider', rating: 48, usage: 6, win: 50 },
    { name: 'Elixir Golem', rating: 45, usage: 5, win: 49 },
    { name: 'Goblin Barrel', rating: 45, usage: 7, win: 49 },
    { name: 'Balloon', rating: 44, usage: 6, win: 48 },
    { name: 'Wall Breakers', rating: 41, usage: 6, win: 47 },
    { name: 'Mortar', rating: 41, usage: 3, win: 47 },
    { name: 'Goblin Drill', rating: 38, usage: 4, win: 46 },
    { name: 'X-Bow', rating: 33, usage: 4, win: 44 },
    { name: 'Lava Hound', rating: 24, usage: 1, win: 39 },
    { name: 'Graveyard', rating: 19, usage: 3, win: 37 },
    { name: 'Royal Delivery', rating: 61, usage: 16, win: 54 },
    { name: 'The Log', rating: 57, usage: 21, win: 52 },
    { name: 'Barbarian Barrel', rating: 54, usage: 15, win: 52 },
    { name: 'Arrows', rating: 51, usage: 13, win: 50 },
    { name: 'Zap', rating: 48, usage: 8, win: 50 },
    { name: 'Goblin Curse', rating: 46, usage: 6, win: 49 },
    { name: 'Giant Snowball', rating: 43, usage: 9, win: 48 },
    { name: 'Void', rating: 26, usage: 3, win: 40 },
    { name: 'Tornado', rating: 23, usage: 9, win: 39 },
    { name: 'Lightning', rating: 54, usage: 10, win: 52 },
    { name: 'Fireball', rating: 55, usage: 31, win: 51 },
    { name: 'Poison', rating: 53, usage: 15, win: 51 },
    { name: 'Freeze', rating: 49, usage: 19, win: 50 },
    { name: 'Earthquake', rating: 43, usage: 12, win: 48 },
    { name: 'Rocket', rating: 37, usage: 14, win: 45 },
    { name: 'Musketeer', rating: 58, usage: 8, win: 53 },
    { name: 'Minion Horde', rating: 55, usage: 4, win: 52 },
    { name: 'Witch', rating: 55, usage: 12, win: 52 },
    { name: 'Zappies', rating: 53, usage: 7, win: 52 },
    { name: 'Executioner', rating: 49, usage: 11, win: 50 },
    { name: 'Electro Wizard', rating: 49, usage: 11, win: 50 },
    { name: 'Baby Dragon', rating: 48, usage: 7, win: 50 },
    { name: 'Hunter', rating: 48, usage: 7, win: 50 },
    { name: 'Skeleton Dragons', rating: 46, usage: 3, win: 49 },
    { name: 'Wizard', rating: 46, usage: 8, win: 49 },
    { name: 'Phoenix', rating: 43, usage: 4, win: 48 },
    { name: 'Magic Archer', rating: 42, usage: 9, win: 47 },
    { name: 'Electro Dragon', rating: 41, usage: 5, win: 47 },
    { name: 'Inferno Dragon', rating: 41, usage: 7, win: 47 },
    { name: 'Dart Goblin', rating: 58, usage: 19, win: 53 },
    { name: 'Firecracker', rating: 54, usage: 16, win: 52 },
    { name: 'Flying Machine', rating: 53, usage: 5, win: 51 },
    { name: 'Minions', rating: 52, usage: 7, win: 51 },
    { name: 'Archers', rating: 48, usage: 6, win: 50 },
    { name: 'Bats', rating: 48, usage: 9, win: 49 },
    { name: 'Mega Minion', rating: 46, usage: 4, win: 49 },
    { name: 'Ice Wizard', rating: 43, usage: 12, win: 48 },
    { name: 'Spear Goblins', rating: 43, usage: 5, win: 48 },
    { name: 'Princess', rating: 41, usage: 14, win: 47 },
    { name: 'Cannon Cart', rating: 66, usage: 5, win: 57 },
    { name: 'Bowler', rating: 59, usage: 11, win: 53 },
    { name: 'Bandit', rating: 58, usage: 13, win: 53 },
    { name: 'Goblin Demolisher', rating: 53, usage: 5, win: 52 },
    { name: 'Sparky', rating: 50, usage: 11, win: 50 },
    { name: 'Bomber', rating: 44, usage: 7, win: 48 },
    { name: 'Mother Witch', rating: 42, usage: 8, win: 47 },
    { name: 'Night Witch', rating: 38, usage: 6, win: 46 },
    { name: 'Rage', rating: 32, usage: 7, win: 43 },
    { name: 'Elixir Collector', rating: 29, usage: 3, win: 42 },
    { name: 'Elite Barbarians', rating: 63, usage: 6, win: 55 },
    { name: 'Royal Recruits', rating: 60, usage: 5, win: 54 },
    { name: 'Mini P.E.K.K.A', rating: 61, usage: 10, win: 54 },
    { name: 'Lumberjack', rating: 57, usage: 7, win: 53 },
    { name: 'P.E.K.K.A', rating: 56, usage: 7, win: 53 },
    { name: 'Goblin Cage', rating: 49, usage: 4, win: 50 },
    { name: 'Furnace', rating: 44, usage: 5, win: 48 },
    { name: 'Goblin Hut', rating: 42, usage: 4, win: 47 },
    { name: 'Bomb Tower', rating: 41, usage: 5, win: 47 },
    { name: 'Barbarians', rating: 40, usage: 3, win: 47 },
    { name: 'Cannon', rating: 39, usage: 7, win: 46 },
    { name: 'Barbarian Hut', rating: 35, usage: 1, win: 45 },
    { name: 'Tesla', rating: 35, usage: 7, win: 44 },
    { name: 'Inferno Tower', rating: 33, usage: 5, win: 44 },
    { name: 'Rascals', rating: 60, usage: 4, win: 54 },
    { name: 'Prince', rating: 61, usage: 10, win: 54 },
    { name: 'Dark Prince', rating: 60, usage: 8, win: 54 },
    { name: 'Knight', rating: 54, usage: 11, win: 52 },
    { name: 'Valkyrie', rating: 52, usage: 11, win: 51 },
    { name: 'Royal Ghost', rating: 52, usage: 8, win: 51 },
    { name: 'Goblin Machine', rating: 40, usage: 4, win: 47 },
    { name: 'Battle Healer', rating: 40, usage: 4, win: 47 },
    { name: 'Ice Golem', rating: 36, usage: 5, win: 45 },
    { name: 'Fisherman', rating: 36, usage: 5, win: 45 },
    { name: 'Miner', rating: 24, usage: 6, win: 40 },
    { name: 'Goblin Gang', rating: 55, usage: 11, win: 52 },
    { name: 'Guards', rating: 52, usage: 11, win: 51 },
    { name: 'Skeleton Barrel', rating: 51, usage: 9, win: 51 },
    { name: 'Electro Spirit', rating: 47, usage: 6, win: 49 },
    { name: 'Fire Spirit', rating: 47, usage: 4, win: 49 },
    { name: 'Ice Spirit', rating: 47, usage: 9, win: 49 },
    { name: 'Goblins', rating: 46, usage: 3, win: 49 },
    { name: 'Tombstone', rating: 46, usage: 6, win: 49 },
    { name: 'Skeleton Army', rating: 46, usage: 9, win: 49 },
    { name: 'Skeletons', rating: 46, usage: 7, win: 49 },
    { name: 'Heal Spirit', rating: 41, usage: 2, win: 47 }
  ];

  // Static Classic Challenge data
  const classicData = [
    { name: 'Rascals', rating: 70, usage: 2, win: 59 },
    { name: 'Zap Evolution', rating: 70, usage: 9, win: 58 },
    { name: 'Three Musketeers', rating: 67, usage: 2, win: 58 },
    { name: 'Zappies', rating: 65, usage: 4, win: 57 },
    { name: 'Minion Horde', rating: 64, usage: 4, win: 56 },
    { name: 'Skeleton Barrel Evolution', rating: 65, usage: 10, win: 56 },
    { name: 'Elixir Collector', rating: 64, usage: 9, win: 56 },
    { name: 'Dark Prince', rating: 63, usage: 5, win: 56 },
    { name: 'Suspicious Bush', rating: 63, usage: 4, win: 56 },
    { name: 'Heal Spirit', rating: 63, usage: 5, win: 56 },
    { name: 'Flying Machine', rating: 61, usage: 2, win: 55 },
    { name: 'Cannon Cart', rating: 61, usage: 2, win: 55 },
    { name: 'Golem', rating: 62, usage: 6, win: 55 },
    { name: 'Minions', rating: 63, usage: 11, win: 55 },
    { name: 'Hero Giant', rating: 63, usage: 13, win: 55 },
    { name: 'Mortar Evolution', rating: 61, usage: 6, win: 55 },
    { name: 'Baby Dragon Evolution', rating: 61, usage: 6, win: 55 },
    { name: 'Mega Minion', rating: 59, usage: 2, win: 55 },
    { name: 'Sparky', rating: 61, usage: 7, win: 54 },
    { name: 'Witch Evolution', rating: 62, usage: 13, win: 54 },
    { name: 'Royal Ghost Evolution', rating: 61, usage: 10, win: 54 },
    { name: 'Vines', rating: 61, usage: 12, win: 54 },
    { name: 'Bowler', rating: 59, usage: 4, win: 54 },
    { name: 'Battle Ram Evolution', rating: 59, usage: 3, win: 54 },
    { name: 'Skeleton King', rating: 59, usage: 5, win: 54 },
    { name: 'Mother Witch', rating: 58, usage: 3, win: 54 },
    { name: 'Giant', rating: 57, usage: 1, win: 54 },
    { name: 'Giant Skeleton', rating: 57, usage: 2, win: 54 },
    { name: 'Battle Healer', rating: 58, usage: 3, win: 54 },
    { name: 'Lava Hound', rating: 57, usage: 1, win: 54 },
    { name: 'Lightning', rating: 58, usage: 5, win: 54 },
    { name: 'Electro Dragon Evolution', rating: 58, usage: 3, win: 54 },
    { name: 'Barbarian Barrel', rating: 61, usage: 21, win: 54 },
    { name: 'Royal Recruits', rating: 56, usage: 1, win: 54 },
    { name: 'Night Witch', rating: 56, usage: 2, win: 53 },
    { name: 'Dart Goblin', rating: 58, usage: 9, win: 53 },
    { name: 'Arrows', rating: 59, usage: 16, win: 53 },
    { name: 'Royal Recruits Evolution', rating: 56, usage: 2, win: 53 },
    { name: 'Skeleton Army Evolution', rating: 58, usage: 13, win: 53 },
    { name: 'Hero Mini P.E.K.K.A', rating: 60, usage: 34, win: 53 },
    { name: 'Inferno Dragon Evolution', rating: 55, usage: 3, win: 53 },
    { name: 'Wizard Evolution', rating: 55, usage: 2, win: 53 },
    { name: 'Dagger Duchess', rating: 55, usage: 2, win: 53 },
    { name: 'Wall Breakers', rating: 54, usage: 4, win: 52 },
    { name: 'Cannoneer', rating: 53, usage: 2, win: 52 },
    { name: 'Rage', rating: 55, usage: 7, win: 52 },
    { name: 'Tombstone', rating: 53, usage: 2, win: 52 },
    { name: 'Phoenix', rating: 51, usage: 0, win: 52 },
    { name: 'Executioner Evolution', rating: 54, usage: 5, win: 52 },
    { name: 'Bats Evolution', rating: 53, usage: 2, win: 52 },
    { name: 'Skeleton Dragons', rating: 52, usage: 1, win: 52 },
    { name: 'Royal Hogs Evolution', rating: 54, usage: 5, win: 52 },
    { name: 'Golden Knight', rating: 53, usage: 5, win: 52 },
    { name: 'Goblin Cage Evolution', rating: 53, usage: 3, win: 52 },
    { name: 'Zap', rating: 53, usage: 5, win: 52 },
    { name: 'Goblin Cage', rating: 51, usage: 1, win: 51 },
    { name: 'Lumberjack Evolution', rating: 52, usage: 3, win: 51 },
    { name: 'Ram Rider', rating: 51, usage: 2, win: 51 },
    { name: 'Guards', rating: 52, usage: 4, win: 51 },
    { name: 'Bomb Tower', rating: 52, usage: 4, win: 51 },
    { name: 'Spirit Empress', rating: 49, usage: 1, win: 51 },
    { name: 'Hunter', rating: 50, usage: 2, win: 51 },
    { name: 'Furnace Evolution', rating: 50, usage: 2, win: 51 },
    { name: 'Battle Ram', rating: 47, usage: 1, win: 51 },
    { name: 'Goblin Giant Evolution', rating: 48, usage: 1, win: 50 },
    { name: 'Goblin Hut', rating: 50, usage: 4, win: 50 },
    { name: 'Goblin Demolisher', rating: 49, usage: 3, win: 50 },
    { name: 'Bats', rating: 49, usage: 4, win: 50 },
    { name: 'Tower Princess', rating: 50, usage: 93, win: 50 },
    { name: 'Graveyard', rating: 49, usage: 6, win: 50 },
    { name: 'Electro Giant', rating: 47, usage: 1, win: 50 },
    { name: 'Electro Wizard', rating: 49, usage: 4, win: 50 },
    { name: 'Balloon', rating: 49, usage: 5, win: 50 },
    { name: 'Prince', rating: 48, usage: 2, win: 50 },
    { name: 'P.E.K.K.A', rating: 47, usage: 2, win: 50 },
    { name: 'Royal Hogs', rating: 47, usage: 1, win: 50 },
    { name: 'Fire Spirit', rating: 48, usage: 8, win: 50 },
    { name: 'Bandit', rating: 48, usage: 3, win: 50 },
    { name: 'Tornado', rating: 48, usage: 9, win: 50 },
    { name: 'Boss Bandit', rating: 48, usage: 5, win: 50 },
    { name: 'Lumberjack', rating: 46, usage: 1, win: 49 },
    { name: 'Bomber Evolution', rating: 46, usage: 1, win: 49 },
    { name: 'Fisherman', rating: 47, usage: 4, win: 49 },
    { name: 'Valkyrie Evolution', rating: 47, usage: 6, win: 49 },
    { name: 'Fireball', rating: 47, usage: 18, win: 49 },
    { name: 'Hunter Evolution', rating: 46, usage: 2, win: 49 },
    { name: 'Valkyrie', rating: 46, usage: 2, win: 49 },
    { name: 'Royal Giant Evolution', rating: 46, usage: 3, win: 49 },
    { name: 'Electro Spirit', rating: 46, usage: 10, win: 49 },
    { name: 'Skeletons', rating: 46, usage: 21, win: 49 },
    { name: 'Monk', rating: 45, usage: 3, win: 49 },
    { name: 'Goblin Machine', rating: 43, usage: 1, win: 49 },
    { name: 'Giant Snowball Evolution', rating: 45, usage: 10, win: 49 },
    { name: 'Poison', rating: 45, usage: 9, win: 49 },
    { name: 'Void', rating: 43, usage: 1, win: 49 },
    { name: 'Royal Ghost', rating: 44, usage: 1, win: 49 },
    { name: 'Archer Queen', rating: 44, usage: 3, win: 48 },
    { name: 'Magic Archer', rating: 44, usage: 4, win: 48 },
    { name: 'Wall Breakers Evolution', rating: 44, usage: 6, win: 48 },
    { name: 'Goblinstein', rating: 43, usage: 1, win: 48 },
    { name: 'Goblin Curse', rating: 44, usage: 3, win: 48 },
    { name: 'Hero Musketeer', rating: 43, usage: 23, win: 48 },
    { name: 'Elixir Golem', rating: 43, usage: 3, win: 48 },
    { name: 'Elite Barbarians', rating: 42, usage: 1, win: 48 },
    { name: 'Hero Knight', rating: 42, usage: 31, win: 48 },
    { name: 'Goblin Gang', rating: 43, usage: 7, win: 48 },
    { name: 'Freeze', rating: 43, usage: 3, win: 48 },
    { name: 'Barbarians Evolution', rating: 41, usage: 1, win: 48 },
    { name: 'Bomber', rating: 42, usage: 2, win: 48 },
    { name: 'Earthquake', rating: 42, usage: 4, win: 48 },
    { name: 'Berserker', rating: 42, usage: 5, win: 48 },
    { name: 'Musketeer Evolution', rating: 42, usage: 2, win: 48 },
    { name: 'Goblin Drill', rating: 42, usage: 4, win: 47 },
    { name: 'Skeleton Barrel', rating: 41, usage: 1, win: 47 },
    { name: 'Cannon', rating: 42, usage: 6, win: 47 },
    { name: 'Furnace', rating: 39, usage: 1, win: 47 },
    { name: 'Skeleton Army', rating: 42, usage: 4, win: 47 },
    { name: 'Inferno Dragon', rating: 41, usage: 2, win: 47 },
    { name: 'Baby Dragon', rating: 40, usage: 1, win: 47 },
    { name: 'Goblin Drill Evolution', rating: 41, usage: 2, win: 47 },
    { name: 'Ice Golem', rating: 41, usage: 6, win: 47 },
    { name: 'Ice Wizard', rating: 41, usage: 5, win: 47 },
    { name: 'Mega Knight', rating: 40, usage: 2, win: 47 },
    { name: 'Barbarians', rating: 38, usage: 1, win: 47 },
    { name: 'Mega Knight Evolution', rating: 40, usage: 9, win: 47 },
    { name: 'Witch', rating: 39, usage: 2, win: 47 },
    { name: 'The Log', rating: 37, usage: 30, win: 47 },
    { name: 'Royal Giant', rating: 36, usage: 0, win: 46 },
    { name: 'Miner', rating: 39, usage: 8, win: 46 },
    { name: 'Musketeer', rating: 37, usage: 1, win: 46 },
    { name: 'Goblins', rating: 38, usage: 1, win: 46 },
    { name: 'Mighty Miner', rating: 39, usage: 3, win: 46 },
    { name: 'Ice Spirit', rating: 38, usage: 16, win: 46 },
    { name: 'Royal Delivery', rating: 38, usage: 6, win: 46 },
    { name: 'Executioner', rating: 37, usage: 1, win: 46 },
    { name: 'Archers Evolution', rating: 37, usage: 2, win: 46 },
    { name: 'Mini P.E.K.K.A', rating: 37, usage: 1, win: 46 },
    { name: 'Firecracker', rating: 37, usage: 2, win: 46 },
    { name: 'Wizard', rating: 36, usage: 1, win: 46 },
    { name: 'Giant Snowball', rating: 37, usage: 2, win: 45 },
    { name: 'Knight', rating: 35, usage: 1, win: 45 },
    { name: 'Hog Rider', rating: 36, usage: 10, win: 45 },
    { name: 'Princess', rating: 36, usage: 5, win: 45 },
    { name: 'Firecracker Evolution', rating: 35, usage: 4, win: 45 },
    { name: 'Skeletons Evolution', rating: 34, usage: 13, win: 45 },
    { name: 'Goblin Barrel', rating: 35, usage: 3, win: 45 },
    { name: 'P.E.K.K.A Evolution', rating: 35, usage: 3, win: 45 },
    { name: 'Inferno Tower', rating: 35, usage: 2, win: 45 },
    { name: 'Spear Goblins', rating: 34, usage: 2, win: 45 },
    { name: 'Dart Goblin Evolution', rating: 34, usage: 3, win: 44 },
    { name: 'Goblin Barrel Evolution', rating: 34, usage: 4, win: 44 },
    { name: 'Tesla Evolution', rating: 34, usage: 8, win: 44 },
    { name: 'Cannon Evolution', rating: 33, usage: 10, win: 44 },
    { name: 'Royal Chef', rating: 34, usage: 4, win: 44 },
    { name: 'Knight Evolution', rating: 33, usage: 2, win: 44 },
    { name: 'Rocket', rating: 33, usage: 6, win: 44 },
    { name: 'Archers', rating: 31, usage: 1, win: 44 },
    { name: 'Mortar', rating: 29, usage: 0, win: 43 },
    { name: 'Little Prince', rating: 32, usage: 2, win: 43 },
    { name: 'Electro Dragon', rating: 29, usage: 0, win: 43 },
    { name: 'X-Bow', rating: 31, usage: 3, win: 43 },
    { name: 'Barbarian Hut', rating: 27, usage: 0, win: 43 },
    { name: 'Tesla', rating: 31, usage: 2, win: 43 },
    { name: 'Rune Giant', rating: 26, usage: 0, win: 42 },
    { name: 'Ice Spirit Evolution', rating: 29, usage: 4, win: 42 },
    { name: 'Goblin Giant', rating: 21, usage: 0, win: 40 },
    { name: 'Clone', rating: 23, usage: 3, win: 39 },
    { name: 'Mirror', rating: 21, usage: 4, win: 38 }
  ];

  // State for card mode and sorting
  const [cardMode, setCardMode] = useState('tripleDraft');
  const [cardSortBy, setCardSortBy] = useState('usage');

  // Get sorted cards based on mode and sort option
  const getSortedCards = () => {
    const data = cardMode === 'tripleDraft' ? tripleDraftData : classicData;
    const sorted = [...data].sort((a, b) => {
      if (cardSortBy === 'usage') return b.usage - a.usage;
      if (cardSortBy === 'winrate') return b.win - a.win;
      return b.rating - a.rating;
    });
    return sorted;
  };

  // Dashboard - Cards Tab
  const renderCardsTab = () => {
    const cards = getSortedCards();

    return (
      <div className="tab-content">
        <div className="cards-container">
          {/* Mode Selector */}
          <div className="cards-mode-selector">
            <button
              className={`mode-btn ${cardMode === 'tripleDraft' ? 'active' : ''}`}
              onClick={() => setCardMode('tripleDraft')}
            >
              Tirage Triple
            </button>
            <button
              className={`mode-btn ${cardMode === 'classic' ? 'active' : ''}`}
              onClick={() => setCardMode('classic')}
            >
              Classique
            </button>
          </div>

          <div className="cards-filters">
            <button
              className={`filter-btn ${cardSortBy === 'usage' ? 'active' : ''}`}
              onClick={() => setCardSortBy('usage')}
            >
              Trié par utilisation
            </button>
            <button
              className={`filter-btn ${cardSortBy === 'winrate' ? 'active' : ''}`}
              onClick={() => setCardSortBy('winrate')}
            >
              Trié par winrate
            </button>
          </div>

          <div className="cards-grid">
            {cards.map((card, index) => (
              <div key={card.name} className="card-stat-item">
                <div className="card-rank">#{index + 1}</div>
                <div className="card-image-container">
                  <img
                    src={`/Card/${cardImageMap[card.name] || 'default.webp'}`}
                    alt={card.name}
                    className="card-image"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <div className="card-name">{card.name}</div>
                <div className="card-stats-row">
                  <div className="card-stat">
                    <span className="stat-label">Rating</span>
                    <span className="stat-value">{card.rating}</span>
                  </div>
                  <div className="card-stat">
                    <span className="stat-label">Usage</span>
                    <span className="stat-value">{card.usage}%</span>
                  </div>
                  <div className="card-stat">
                    <span className="stat-label">Win</span>
                    <span className={`stat-value ${card.win >= 50 ? 'positive' : 'negative'}`}>{card.win}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Reload Twitter widget when news tab is shown
  useEffect(() => {
    if (activeTab === 'news' && window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load();
    }
  }, [activeTab]);

  // Dashboard - News Tab
  const renderNewsTab = () => {
    return (
      <div className="tab-content">
        <div className="news-container">
          <div className="news-header">
            <h2>Clash Royale News</h2>
            <p className="news-subtitle">Latest updates from the official Clash Royale Twitter</p>
          </div>

          <div className="news-content">
            <div className="twitter-embed">
              <a
                className="twitter-timeline"
                data-theme="dark"
                data-height="600"
                data-chrome="noheader nofooter transparent"
                href="https://twitter.com/ClashRoyale?ref_src=twsrc%5Etfw"
              >
                Tweets by ClashRoyale
              </a>
            </div>

            <div className="news-links">
              <h3>Quick Links</h3>
              <a href="https://twitter.com/ClashRoyale" target="_blank" rel="noopener noreferrer" className="news-link">
                <span>🐦</span> Official Twitter
              </a>
              <a href="https://www.reddit.com/r/ClashRoyale/" target="_blank" rel="noopener noreferrer" className="news-link">
                <span>📱</span> Reddit Community
              </a>
              <a href="https://royaleapi.com/blog" target="_blank" rel="noopener noreferrer" className="news-link">
                <span>📊</span> RoyaleAPI Blog
              </a>
              <a href="https://clashroyale.com/blog" target="_blank" rel="noopener noreferrer" className="news-link">
                <span>📰</span> Official Blog
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard
  const renderDashboard = () => {
    if (!currentUser) return null;

    return (
      <div className="dashboard-layout">
        <Sidebar />
        <main className="main-content">
          {activeTab === 'play' && renderPlayTab()}
          {activeTab === 'leaderboard' && renderLeaderboardTab()}
          {activeTab === 'track' && renderTrackTab()}
          {activeTab === 'cards' && renderCardsTab()}
          {activeTab === 'news' && renderNewsTab()}
        </main>
      </div>
    );
  };

  // Searching for Match
  const renderSearching = () => (
    <div className="fullscreen-view">
      <div className="searching-container">
        <div className="searching-spinner"></div>
        <h2>Searching...</h2>
        <p>Looking for an opponent at your level</p>
        <button className="btn-cancel" onClick={cancelSearch}>Cancel</button>
      </div>
    </div>
  );

  // Match View with invite link and QR code
  const renderMatch = () => {
    const opponentTag = opponent?.playerTag || '';
    const inviteLink = getInviteLink(opponentTag);
    const qrCodeUrl = getQRCodeUrl(inviteLink);

    return (
      <div className="fullscreen-view">
        <div className="match-container">
          {verifying ? (
            <div className="verifying">
              <div className="searching-spinner"></div>
              <h2>Verifying...</h2>
              <p>Checking result via Clash Royale API</p>
            </div>
          ) : (
            <>
              <h2 className="match-title">Opponent Found!</h2>

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

              {/* Invite Section */}
              <div className="invite-section">
                <h3>Add your opponent as friend</h3>
                <div className="invite-content">
                  <div className="qr-code">
                    <img src={qrCodeUrl} alt="QR Code to add friend" />
                    <span>Scan with your phone</span>
                  </div>
                  <div className="invite-link-container">
                    <p>Or click the link below:</p>
                    <a href={inviteLink} target="_blank" rel="noopener noreferrer" className="invite-link">
                      Open in Clash Royale
                    </a>
                    <button
                      className="btn-copy"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink);
                        alert('Link copied!');
                      }}
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>

              <div className="match-instructions">
                <p>📱 Play your match in Clash Royale</p>
                <p className="match-hint">Play a friendly match, then verify the result</p>
              </div>

              {error && <div className="match-error">{error}</div>}

              <div className="match-actions">
                <button className="btn-verify" onClick={verifyMatch}>
                  Verify Result
                </button>
                <button className="btn-cancel" onClick={() => { setView('dashboard'); setOpponent(null); setMatchId(null); setError(''); }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Result View
  const renderResult = () => {
    const isVictory = matchResult === 'victory';
    return (
      <div className="fullscreen-view">
        <div className={`result-container ${isVictory ? 'victory' : 'defeat'}`}>
          <span className="result-icon">{isVictory ? '🏆' : '💔'}</span>
          <h1 className="result-title">{isVictory ? 'VICTORY!' : 'DEFEAT'}</h1>
          <div className="result-trophies">
            <span className={isVictory ? 'positive' : 'negative'}>
              {isVictory ? '+30' : '-30'} 🏆
            </span>
          </div>
          <p className="result-total">Total: {currentUser?.trophies} trophies</p>
          <button className="btn-continue" onClick={() => {
            setView('dashboard');
            setOpponent(null);
            setMatchId(null);
            setMatchResult(null);
            setError('');
          }}>
            Continue
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
