import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DIFFICULTY, formatDuration } from '../lib/aptitude';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const weekday = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
const clock = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const draftKey = (day) => `apt-daily-${day}`;

function readDraft(day, n) {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(day)) || 'null');
    if (Array.isArray(saved) && saved.length === n) return saved;
  } catch {
    // ignore a broken draft
  }
  return Array(n).fill(null);
}

// Five questions a day, five minutes, one go. The server holds the clock.
export default function AptitudeDaily() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [run, setRun] = useState(null); // { questions, deadline }
  const [answers, setAnswers] = useState([]);
  const [left, setLeft] = useState(null);
  const [outcome, setOutcome] = useState(null); // { result, questions, rewards, badges }
  const [busy, setBusy] = useState(false);
  const offsetRef = useRef(0);
  const sentRef = useRef(false);

  const begin = useCallback((data) => {
    offsetRef.current = new Date(data.serverNow).getTime() - Date.now();
    setRun({ questions: data.questions, deadline: new Date(data.deadline).getTime() });
    setAnswers(readDraft(data.day || dateKey(), data.questions.length));
    setLeft((new Date(data.deadline).getTime() - Date.now() - offsetRef.current) / 1000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/aptitude/daily')
      .then((r) => {
        if (cancelled) return;
        setInfo(r);
        if (r.state === 'started') begin(r);
        if (r.state === 'done') setOutcome({ result: r.result, questions: r.questions, rewards: [], badges: [] });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user, begin]);

  const submit = useCallback(async (list) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setBusy(true);
    try {
      const r = await apiRequest('/aptitude/daily/submit', { method: 'POST', body: JSON.stringify({ answers: list }) });
      try { localStorage.removeItem(draftKey(info.day)); } catch { /* ignore */ }
      setOutcome(r);
      setRun(null);
      setInfo((i) => ({ ...i, state: 'done', streak: r.streak || i.streak, week: i.week?.map((d, idx) => (idx === 6 ? { ...d, done: true, correct: r.result.correctCount, total: r.result.total } : d)) }));
    } catch (e) {
      setError(e.message);
      sentRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [info]);

  // Countdown; at zero whatever is picked is sent.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    if (!run) return undefined;
    const t = setInterval(() => {
      const s = (run.deadline - Date.now() - offsetRef.current) / 1000;
      setLeft(s);
      if (s <= 0) submit(answersRef.current);
    }, 500);
    return () => clearInterval(t);
  }, [run, submit]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await apiRequest('/aptitude/daily/start', { method: 'POST' });
      begin({ ...r, day: info.day });
      setInfo((i) => ({ ...i, state: 'started' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (qi, oi) => {
    const next = answers.map((a, i) => (i === qi ? oi : a));
    setAnswers(next);
    try { localStorage.setItem(draftKey(info.day), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const answered = answers.filter((a) => a != null).length;

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <span className="apt-eyebrow"><i className="bi bi-lightning-charge" aria-hidden="true" /> Daily challenge</span>
            <h1>Five questions. Five minutes.</h1>
            <p>A fresh mixed set every day at midnight (India time). One attempt, so make it count.</p>
          </div>
        </header>

        <div className="container apt-body apt-daily">
          {error && <p className="apt-error">{error}</p>}
          {!info && !error && <div className="apt-qcard apt-skeleton tall" />}

          {info && !info.available && <div className="apt-empty"><i className="bi bi-hourglass" aria-hidden="true" /><h2>No challenge yet</h2><p className="apt-muted">Questions are still being added. Check back soon.</p></div>}

          {info?.week && (
            <section className="apt-week" aria-label="This week">
              <div className="apt-week-days">
                {info.week.map((d) => (
                  <div key={d.day} className={`apt-week-day${d.done ? ' is-done' : ''}${d.done && d.correct === d.total ? ' is-perfect' : ''}`}>
                    <span>{weekday(d.day)}</span>
                    <b>{d.done ? `${d.correct}/${d.total}` : '–'}</b>
                  </div>
                ))}
              </div>
              <div className="apt-week-streak"><i className="bi bi-fire" aria-hidden="true" /> <b>{info.streak}</b> day streak <small>best {info.bestStreak}</small></div>
            </section>
          )}

          {info?.available && !user && (
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div><strong>Sign in to take today&apos;s challenge</strong><span>{info.count} questions · {formatDuration(info.seconds)} · up to {info.xpMax} XP</span></div>
              <Link to="/login" state={{ from: '/aptitude/daily' }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          )}

          {info?.available && user && info.state === 'new' && (
            <section className="apt-panel apt-daily-start">
              <h2>Today&apos;s challenge is ready</h2>
              <ul className="apt-test-facts">
                <li><i className="bi bi-list-ol" aria-hidden="true" /> {info.count} questions</li>
                <li><i className="bi bi-clock" aria-hidden="true" /> {formatDuration(info.seconds)}</li>
                <li><i className="bi bi-gem" aria-hidden="true" /> Up to {info.xpMax} XP</li>
                <li><i className="bi bi-stars" aria-hidden="true" /> +10 bonus for all correct</li>
              </ul>
              <p className="apt-muted small">The timer starts when you press Start and keeps running if you leave. Answers are sent when you submit or when time runs out.</p>
              <button type="button" className="apt-btn apt-btn-primary" onClick={start} disabled={busy}><i className="bi bi-play-fill" aria-hidden="true" /> {busy ? 'Starting…' : 'Start'}</button>
            </section>
          )}

          {run && (
            <>
              <div className="apt-daily-bar">
                <span>{answered}/{run.questions.length} answered</span>
                <span className={`apt-timer${left != null && left < 30 ? ' over' : ''}`} role="timer"><i className="bi bi-stopwatch" aria-hidden="true" /> {left == null ? '--:--' : clock(left)}</span>
              </div>
              <div className="apt-review-list">
                {run.questions.map((q, qi) => (
                  <section key={q.id} className="apt-qcard" aria-labelledby={`dq-${qi}`}>
                    <div className="apt-qmeta">
                      <strong id={`dq-${qi}`}>Q{qi + 1}</strong>
                      <span className="apt-chip">{q.topicName}</span>
                      <span className={`apt-chip diff-${DIFFICULTY[q.difficulty]?.tone}`}>{DIFFICULTY[q.difficulty]?.label}</span>
                    </div>
                    <p className="apt-statement">{q.statement}</p>
                    <div className="apt-options" role="radiogroup" aria-labelledby={`dq-${qi}`}>
                      {q.options.map((o, oi) => (
                        <button key={oi} type="button" role="radio" aria-checked={answers[qi] === oi} className={`apt-option${answers[qi] === oi ? ' is-selected' : ''}`} onClick={() => pick(qi, oi)} disabled={busy}>
                          <span className="apt-letter">{LETTERS[oi]}</span>
                          <span>{o}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="apt-topic-cta apt-section">
                <button type="button" className="apt-btn apt-btn-primary" onClick={() => submit(answers)} disabled={busy}>{busy ? 'Submitting…' : `Submit (${answered}/${run.questions.length})`}</button>
              </div>
            </>
          )}

          {outcome && (
            <>
              <section className={`apt-daily-score ${outcome.result.correctCount === outcome.result.total ? 'is-perfect' : ''}`}>
                <strong>{outcome.result.correctCount}/{outcome.result.total}</strong>
                <div>
                  <b>{outcome.result.correctCount === outcome.result.total ? 'Perfect day!' : outcome.result.late ? 'Time ran out' : 'Challenge done'}</b>
                  <span>
                    {outcome.result.xp ? `+${outcome.result.xp} XP` : 'No XP this time'}
                    {outcome.result.seconds ? ` · ${formatDuration(outcome.result.seconds)}` : ''}
                    {' · '}Come back tomorrow for a new set.
                  </span>
                  {(outcome.rewards?.length > 0 || outcome.badges?.length > 0) && (
                    <span className="apt-daily-rewards">
                      {outcome.rewards?.map((w) => <em key={w.label}>🎉 {w.label} +{w.xp} XP</em>)}
                      {outcome.badges?.map((b) => <em key={b.id}>{b.emoji} New badge: {b.name}</em>)}
                    </span>
                  )}
                </div>
              </section>
              <div className="apt-review-list apt-section">
                {outcome.questions.map((q, qi) => {
                  const mine = outcome.result.answers[qi]?.selected;
                  const kind = mine == null ? 'skipped' : outcome.result.answers[qi].correct ? 'correct' : 'wrong';
                  return (
                    <article key={q.id} className={`apt-qcard apt-review is-${kind}`}>
                      <div className="apt-qmeta">
                        <strong>Q{qi + 1}</strong>
                        <span className="apt-chip">{q.topicName}</span>
                        <span className={`apt-marks is-${kind}`}>{kind === 'correct' ? 'Correct' : kind === 'wrong' ? 'Wrong' : 'Skipped'}</span>
                      </div>
                      <p className="apt-statement">{q.statement}</p>
                      <div className="apt-options">
                        {q.options.map((o, oi) => (
                          <div key={oi} className={`apt-option ${oi === q.answer ? 'is-correct' : oi === mine ? 'is-wrong' : ''}`}>
                            <span className="apt-letter">{LETTERS[oi]}</span>
                            <span>{o}</span>
                            {oi === mine && <small className="apt-yours">Your answer</small>}
                          </div>
                        ))}
                      </div>
                      <details className="apt-solution" open={kind !== 'correct'}>
                        <summary>Solution</summary>
                        <p className="apt-explain">{q.explanation}</p>
                        {q.shortcut && <p className="apt-explain"><b>Shortcut:</b> {q.shortcut}</p>}
                      </details>
                    </article>
                  );
                })}
              </div>
              <div className="apt-topic-cta apt-section">
                <Link to="/aptitude/practice" className="apt-btn apt-btn-primary">Keep practising</Link>
                <Link to="/aptitude/leaderboard" className="apt-btn">Leaderboard</Link>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function dateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
