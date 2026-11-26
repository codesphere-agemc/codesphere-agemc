import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DIFFICULTY, formatDuration } from '../lib/aptitude';
import '../css/Aptitude.css';

const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const band = (acc) => (acc >= 70 ? 'good' : acc >= 40 ? 'mid' : 'low');

// Questions answered per day, last 30 days. One series, so no legend; hover shows the numbers.
function ActivityChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 900;
  const H = 160;
  const pad = { l: 28, r: 6, t: 10, b: 22 };
  const max = Math.max(4, ...days.map((d) => d.answered));
  const step = (W - pad.l - pad.r) / days.length;
  const bw = Math.max(3, step - 4);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max];
  const h = hover != null ? days[hover] : null;
  return (
    <div className="apt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Questions answered per day over the last 30 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="apt-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="apt-axis">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const top = y(d.answered);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {d.answered > 0 && <rect x={x} y={top} width={bw} height={H - pad.b - top} rx="2" className={`apt-col${hover === i ? ' is-hover' : ''}`} />}
              {d.tests > 0 && <circle cx={x + bw / 2} cy={H - pad.b + 8} r="3" className="apt-testdot" />}
            </g>
          );
        })}
        {[0, 14, 29].map((i) => <text key={i} x={pad.l + i * step + step / 2} y={H - 2} textAnchor="middle" className="apt-axis">{shortDay(days[i].day)}</text>)}
      </svg>
      <p className="apt-chart-note" aria-live="polite">
        {h ? <><b>{shortDay(h.day)}</b>: {h.answered} answered, {h.correct} correct{h.tests ? `, ${h.tests} test${h.tests > 1 ? 's' : ''}` : ''}</> : <>Hover a day for details. <span className="apt-testdot-key" aria-hidden="true" /> marks a day with a mock test.</>}
      </p>
    </div>
  );
}

// Mock test score (%) over the last 10 tests.
function TrendChart({ tests }) {
  const [hover, setHover] = useState(null);
  const W = 900;
  const H = 170;
  const pad = { l: 34, r: 14, t: 12, b: 14 };
  const x = (i) => pad.l + (tests.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (tests.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => H - pad.b - (v / 100) * (H - pad.t - pad.b);
  const path = tests.map((t, i) => `${i ? 'L' : 'M'}${x(i)},${y(t.percent)}`).join(' ');
  const h = hover != null ? tests[hover] : null;
  return (
    <div className="apt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mock test scores in percent" onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="apt-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="apt-axis">{t}%</text>
          </g>
        ))}
        <path d={path} className="apt-line" />
        {tests.map((t, i) => (
          <g key={t.id} onMouseEnter={() => setHover(i)}>
            <circle cx={x(i)} cy={y(t.percent)} r="14" fill="transparent" />
            <circle cx={x(i)} cy={y(t.percent)} r={hover === i ? 6 : 4.5} className="apt-dot" />
          </g>
        ))}
      </svg>
      <p className="apt-chart-note" aria-live="polite">
        {h ? <><b>{h.title}</b>: {h.score} / {h.maxScore} ({h.percent}%) · {new Date(h.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</> : 'Hover a point to see the test.'}
      </p>
    </div>
  );
}

function Bars({ rows }) {
  return (
    <ul className="apt-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.label}</span>
          <span className="apt-bar" aria-hidden="true"><span style={{ width: `${r.answered ? Math.max(2, r.accuracy) : 0}%` }} className={band(r.accuracy)} /></span>
          <b>{r.answered ? `${r.accuracy}%` : '–'}</b>
        </li>
      ))}
    </ul>
  );
}

function TopicList({ list, empty, tone }) {
  if (!list.length) return <p className="apt-muted small">{empty}</p>;
  return (
    <ul className="apt-topic-rank">
      {list.map((t) => (
        <li key={t.slug}>
          <div>
            <strong>{t.name}</strong>
            <span>{t.correct}/{t.answered} correct · {t.accuracy}%</span>
          </div>
          <Link to={`/aptitude/practice?topic=${t.slug}`} className={`apt-btn${tone === 'weak' ? ' apt-btn-primary' : ''}`}>{tone === 'weak' ? 'Practise' : 'More'}</Link>
        </li>
      ))}
    </ul>
  );
}

export default function AptitudeProgress() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    apiRequest('/aptitude/analytics').then((r) => !cancelled && setData(r)).catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const s = data?.summary;
  const empty = s && !s.answers && !data.tests.length;

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <span className="apt-eyebrow"><i className="bi bi-graph-up-arrow" aria-hidden="true" /> My performance</span>
            <h1>Your aptitude progress</h1>
            <p>Accuracy by category and topic, weak spots to work on, and how your mock test scores are moving.</p>
          </div>
        </header>

        <div className="container apt-body">
          {!user && (
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div><strong>Sign in to see your progress</strong><span>Practice and test results are saved to your account.</span></div>
              <Link to="/login" state={{ from: '/aptitude/progress' }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          )}
          {error && <p className="apt-error">{error}</p>}
          {user && !data && !error && <div className="apt-stats">{Array.from({ length: 6 }, (_, i) => <div key={i} className="apt-stat apt-skeleton" />)}</div>}

          {s && (
            <>
              <section className="apt-stats" aria-label="Totals">
                <div className="apt-stat"><i className="bi bi-mortarboard" aria-hidden="true" /><div><strong>{s.level.name}</strong><span>{s.level.next ? `${s.level.next.min - s.questionsSolved} solved to ${s.level.next.name}` : 'Top level'}</span></div></div>
                <div className="apt-stat"><i className="bi bi-check2-circle" aria-hidden="true" /><div><strong>{s.questionsSolved}</strong><span>Solved of {s.questionsAttempted} tried</span></div></div>
                <div className="apt-stat"><i className="bi bi-bullseye" aria-hidden="true" /><div><strong>{s.accuracy}%</strong><span>Practice accuracy</span></div></div>
                <div className="apt-stat"><i className="bi bi-hourglass-split" aria-hidden="true" /><div><strong>{formatDuration(s.practiceSeconds)}</strong><span>Practice time</span></div></div>
                <div className="apt-stat"><i className="bi bi-fire" aria-hidden="true" /><div><strong>{s.streak} / {s.bestStreak}</strong><span>Streak / best</span></div></div>
                <div className="apt-stat"><i className="bi bi-gem" aria-hidden="true" /><div><strong>{s.xp}</strong><span>Aptitude XP</span></div></div>
              </section>

              {empty ? (
                <div className="apt-empty apt-section">
                  <i className="bi bi-bar-chart" aria-hidden="true" />
                  <h2>Nothing to show yet</h2>
                  <p className="apt-muted">Answer a few practice questions or take a mock test and your charts will appear here.</p>
                  <div className="apt-topic-cta" style={{ justifyContent: 'center', marginTop: 12 }}>
                    <Link to="/aptitude/practice" className="apt-btn apt-btn-primary">Start practising</Link>
                    <Link to="/aptitude/tests" className="apt-btn">Mock tests</Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="apt-two">
                    <section className="apt-panel">
                      <h2>Focus on these</h2>
                      <TopicList list={data.weak} tone="weak" empty="No weak topics yet. A topic shows here once you've answered 3+ questions in it with under 60% right." />
                    </section>
                    <section className="apt-panel">
                      <h2>Your strengths</h2>
                      <TopicList list={data.strong} tone="strong" empty="Topics where you score 80% or more (3+ answers) show here." />
                    </section>
                  </div>

                  <section className="apt-panel apt-section">
                    <h2>Activity, last 30 days</h2>
                    <ActivityChart days={data.activity} />
                  </section>

                  <div className="apt-two apt-section">
                    <section className="apt-panel">
                      <h2>Accuracy by category</h2>
                      <Bars rows={data.categories.map((c) => ({ key: c.slug, label: `${c.short} (${c.answered})`, answered: c.answered, accuracy: c.accuracy }))} />
                      <p className="apt-muted small apt-gap">Topics tried: {data.categories.map((c) => `${c.short} ${c.topicsTried}/${c.topicsTotal}`).join(' · ')}</p>
                    </section>
                    <section className="apt-panel">
                      <h2>Accuracy by difficulty</h2>
                      <Bars rows={data.difficulty.map((d) => ({ key: d.difficulty, label: `${DIFFICULTY[d.difficulty]?.label} (${d.answered})`, answered: d.answered, accuracy: d.accuracy }))} />
                    </section>
                  </div>

                  <section className="apt-panel apt-section">
                    <h2>Mock test scores</h2>
                    {data.tests.length ? <TrendChart tests={data.tests} /> : <p className="apt-muted">No mock tests yet. <Link to="/aptitude/tests">Take one</Link> to see your trend.</p>}
                  </section>

                  <section className="apt-section">
                    <div className="apt-section-head"><h2>All topics</h2></div>
                    <div className="apt-table-wrap">
                      <table className="apt-table">
                        <thead><tr><th>Topic</th><th>Answered</th><th>Correct</th><th>Accuracy</th><th>Avg time</th><th /></tr></thead>
                        <tbody>
                          {data.topics.map((t) => (
                            <tr key={t.slug}>
                              <td>{t.name}</td>
                              <td>{t.answered}</td>
                              <td>{t.correct}</td>
                              <td><span className={`apt-acc ${band(t.accuracy)}`}>{t.accuracy}%</span></td>
                              <td>{formatDuration(t.avgSeconds)}</td>
                              <td><Link to={`/aptitude/practice?topic=${t.slug}`}>Practise</Link></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="apt-topic-cta apt-section">
                    <Link to="/aptitude/mistakes" className="apt-btn apt-btn-primary"><i className="bi bi-journal-x" aria-hidden="true" /> Mistake notebook{s.mistakes ? ` (${s.mistakes})` : ''}</Link>
                    <Link to="/aptitude/tests#previous" className="apt-btn">Previous tests</Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
