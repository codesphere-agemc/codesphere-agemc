import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DIFFICULTY, formatDuration } from '../lib/aptitude';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FILTERS = [
  ['all', 'All'],
  ['wrong', 'Wrong'],
  ['skipped', 'Skipped'],
  ['correct', 'Correct'],
  ['review', 'Marked'],
];
const kindOf = (it) => (it.correct ? 'correct' : it.selected == null ? 'skipped' : 'wrong');

// Score ring drawn in SVG (no chart library).
function Ring({ value, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="apt-ring" role="img" aria-label={`Score ${value} out of ${max}`}>
      <circle cx="60" cy="60" r={r} className="apt-ring-track" />
      <circle cx="60" cy="60" r={r} className="apt-ring-fill" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" className="apt-ring-value">{value}</text>
      <text x="60" y="78" textAnchor="middle" className="apt-ring-max">of {max}</text>
    </svg>
  );
}

export default function AptitudeResult() {
  const { attemptId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    apiRequest(`/aptitude/tests/attempts/${attemptId}`)
      .then((r) => {
        if (cancelled) return;
        if (r.exam) navigate(`/aptitude/exam/${attemptId}`, { replace: true }); // still running
        else setResult(r.result);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attemptId, user, navigate]);

  const shown = result ? result.items.map((it, i) => ({ ...it, n: i + 1 })).filter((it) => (filter === 'all' ? true : filter === 'review' ? it.review : kindOf(it) === filter)) : [];

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude/tests" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Mock tests</Link>
            <span className="apt-eyebrow"><i className="bi bi-clipboard-check" aria-hidden="true" /> Test result</span>
            <h1>{result?.test?.title || (error ? 'Result not available' : 'Loading result…')}</h1>
            {result && (
              <p>
                {result.number > 1 ? `Attempt ${result.number} · ` : ''}
                {result.status === 'auto-submitted' ? 'Submitted automatically when time ran out' : 'Submitted'}
                {' · '}{new Date(result.submittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        </header>

        <div className="container apt-body">
          {!user && (
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div><strong>Sign in to see your result</strong><span>Results are only visible to the student who took the test.</span></div>
              <Link to="/login" state={{ from: `/aptitude/results/${attemptId}` }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          )}
          {error && <p className="apt-error">{error}</p>}

          {result && (
            <>
              <section className="apt-score">
                <Ring value={result.score} max={result.maxScore} />
                <div className="apt-score-stats">
                  <div className="apt-stat"><i className="bi bi-check2-circle" aria-hidden="true" /><div><strong>{result.correctCount}</strong><span>Correct</span></div></div>
                  <div className="apt-stat"><i className="bi bi-x-circle" aria-hidden="true" /><div><strong>{result.wrongCount}</strong><span>Wrong</span></div></div>
                  <div className="apt-stat"><i className="bi bi-dash-circle" aria-hidden="true" /><div><strong>{result.skippedCount}</strong><span>Skipped</span></div></div>
                  <div className="apt-stat"><i className="bi bi-bullseye" aria-hidden="true" /><div><strong>{result.accuracy}%</strong><span>Accuracy</span></div></div>
                  <div className="apt-stat"><i className="bi bi-hourglass-split" aria-hidden="true" /><div><strong>{formatDuration(result.timeTaken)}</strong><span>Time taken</span></div></div>
                  <div className="apt-stat"><i className="bi bi-gem" aria-hidden="true" /><div><strong>+{result.xp}</strong><span>{result.number > 1 ? 'XP (first attempt only)' : 'XP earned'}</span></div></div>
                </div>
              </section>

              <section className="apt-section apt-panel">
                <h2>By topic</h2>
                <ul className="apt-bars">
                  {result.topics.map((t) => {
                    const pct = Math.round((t.correct / t.total) * 100);
                    return (
                      <li key={t.topic}>
                        <span>{t.topic}</span>
                        <span className="apt-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} className={pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'low'} /></span>
                        <b>{t.correct}/{t.total}</b>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="apt-section">
                <div className="apt-section-head">
                  <h2>Review answers</h2>
                  <div className="apt-filter-tabs" role="tablist" aria-label="Filter questions">
                    {FILTERS.map(([key, label]) => (
                      <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'is-on' : ''} onClick={() => setFilter(key)}>{label}</button>
                    ))}
                  </div>
                </div>
                {shown.length === 0 && <p className="apt-muted">No questions here.</p>}
                <div className="apt-review-list">
                  {shown.map((it) => (
                    <article key={it.n} className={`apt-qcard apt-review is-${kindOf(it)}`}>
                      <div className="apt-qmeta">
                        <strong>Q{it.n}</strong>
                        <span className="apt-chip">{it.topicName}</span>
                        {it.difficulty && <span className={`apt-chip diff-${DIFFICULTY[it.difficulty]?.tone}`}>{DIFFICULTY[it.difficulty]?.label}</span>}
                        <span className={`apt-marks is-${kindOf(it)}`}>{it.marks > 0 ? `+${it.marks}` : it.marks}</span>
                      </div>
                      <p className="apt-statement">{it.statement}</p>
                      <div className="apt-options">
                        {it.options.map((o, i) => {
                          const mark = i === it.answer ? 'is-correct' : i === it.selected ? 'is-wrong' : '';
                          return (
                            <div key={i} className={`apt-option ${mark}`}>
                              <span className="apt-letter">{LETTERS[i]}</span>
                              <span>{o}</span>
                              {i === it.selected && <small className="apt-yours">Your answer</small>}
                              {mark === 'is-correct' && <i className="bi bi-check-circle-fill" aria-label="Correct answer" />}
                            </div>
                          );
                        })}
                      </div>
                      <details className="apt-solution">
                        <summary>Solution{it.seconds ? ` · you spent ${formatDuration(it.seconds)}` : ''}</summary>
                        <p className="apt-explain">{it.explanation}</p>
                        {it.shortcut && <p className="apt-explain"><b>Shortcut:</b> {it.shortcut}</p>}
                      </details>
                    </article>
                  ))}
                </div>
              </section>

              <div className="apt-topic-cta">
                <Link to="/aptitude/tests" className="apt-btn apt-btn-primary">More tests</Link>
                <Link to="/aptitude/practice" className="apt-btn">Practise questions</Link>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
