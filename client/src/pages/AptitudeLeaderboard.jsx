import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import '../css/Aptitude.css';

const PERIODS = [['week', 'This week'], ['all', 'All time']];
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function Avatar({ row }) {
  if (row.avatar) return <img src={row.avatar} alt="" className="apt-avatar" loading="lazy" />;
  return <span className="apt-avatar" aria-hidden="true">{row.name?.[0]?.toUpperCase() || '?'}</span>;
}

// Aptitude XP rankings: the last 7 days, or all time.
export default function AptitudeLeaderboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/aptitude/leaderboard?period=${period}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [period, user]);

  const current = data?.period === period ? data : null;
  const meShown = current?.me && current.rows.some((r) => r.id === current.me.id);

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <span className="apt-eyebrow"><i className="bi bi-bar-chart-steps" aria-hidden="true" /> Leaderboard</span>
            <h1>Aptitude rankings</h1>
            <p>Ranked by aptitude XP from practice, mock tests and daily challenges. Aptitude XP also counts on the <Link to="/leaderboard" className="apt-hero-link">main CodeSphere leaderboard</Link>.</p>
          </div>
        </header>

        <div className="container apt-body">
          <div className="apt-notebook-bar">
            <div className="apt-filter-tabs" role="tablist" aria-label="Period">
              {PERIODS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? 'is-on' : ''} onClick={() => setPeriod(key)}>{label}</button>
              ))}
            </div>
            {current && <span className="apt-muted small">{current.total} student{current.total === 1 ? '' : 's'} ranked</span>}
          </div>
          {error && <p className="apt-error">{error}</p>}

          {current?.me && !meShown && (
            <div className="apt-lb-me">You&apos;re <b>#{current.me.rank}</b> with <b>{current.me.xp} XP</b>. Keep going!</div>
          )}
          {user && current && !current.me && (
            <div className="apt-lb-me">You&apos;re not on the board {period === 'week' ? 'this week' : 'yet'}. <Link to="/aptitude/daily">Do today&apos;s challenge</Link> to get started.</div>
          )}

          {!current && <div className="apt-qcard apt-skeleton tall" />}
          {current && current.rows.length === 0 && (
            <div className="apt-empty"><i className="bi bi-trophy" aria-hidden="true" /><h2>No one yet</h2><p className="apt-muted">Be the first: answer a question or take today&apos;s challenge.</p></div>
          )}
          {current && current.rows.length > 0 && (
            <ol className="apt-lb">
              {current.rows.map((r) => (
                <li key={r.id} className={`${r.rank <= 3 ? `top top-${r.rank}` : ''}${current.me?.id === r.id ? ' is-me' : ''}`}>
                  <span className="apt-lb-rank">{MEDALS[r.rank] || `#${r.rank}`}</span>
                  <Avatar row={r} />
                  <span className="apt-lb-name">
                    <strong>{r.name}{current.me?.id === r.id && <small> (you)</small>}</strong>
                    <span>{[r.year, `${r.solved} solved`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="apt-lb-xp"><b>{r.xp}</b> XP</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
