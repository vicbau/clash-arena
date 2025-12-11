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
  const [showMatchFoundAnimation, setShowMatchFoundAnimation] = useState(false);
  const [pendingMatchData, setPendingMatchData] = useState(null);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('match_found', (data) => {
      setSearchingMatch(false);
      setPendingMatchData(data);
      setShowMatchFoundAnimation(true);

      // Play sound
      const audio = new Audio('/Hog-rider-sound-effect.mp3');
      audio.volume = 0.7;
      audio.play().catch(e => console.log('Audio play failed:', e));

      // After animation ends, show match screen
      setTimeout(() => {
        setShowMatchFoundAnimation(false);
        setOpponent(data.opponent);
        setMatchId(data.matchId);
        setView('match');
        setPendingMatchData(null);
      }, 3000); // 3 seconds for animation
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
            Compete against players in classic mode like in the old days with a leaderboard
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
            <div className="hero-swords">
              <span>⚔️</span>
              <span className="crown-icon">👑</span>
              <span>⚔️</span>
            </div>
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
                {/* Bouton test temporaire */}
                <button
                  style={{marginTop: '10px', padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem'}}
                  onClick={() => {
                    setShowMatchFoundAnimation(true);
                    setTimeout(() => setShowMatchFoundAnimation(false), 4000);
                  }}
                >
                  TEST ANIMATION
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

  // Match Found Animation
  const renderMatchFoundAnimation = () => (
    <div className="match-found-overlay">
      <div className="match-found-container">
        <video
          autoPlay
          playsInline
          className="match-found-video"
          src={process.env.PUBLIC_URL + '/chroma-keyed-video.webm'}
          onError={(e) => console.log('Video error:', e.target.error)}
          onLoadedData={() => console.log('Video loaded successfully')}
        />
        <audio
          autoPlay
          src={process.env.PUBLIC_URL + '/Hog-rider-sound-effect.mp3'}
          onError={(e) => console.log('Audio error:', e.target.error)}
          onLoadedData={() => console.log('Audio loaded successfully')}
        />
        <h1 className="match-found-text">MATCH FOUND!</h1>
      </div>
    </div>
  );

  return (
    <div className="app">
      {view === 'landing' && renderLanding()}
      {view === 'dashboard' && renderDashboard()}
      {view === 'searching' && renderSearching()}
      {view === 'match' && renderMatch()}
      {view === 'result' && renderResult()}
      {showAuthModal && renderAuthModal()}
      {showMatchFoundAnimation && renderMatchFoundAnimation()}
    </div>
  );
}

export default App;
