import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const STATUS = {
  'not-visited': 'Not visited',
  'not-answered': 'Not answered',
  answered: 'Answered',
  review: 'Marked for review',
  'answered-review': 'Answered and marked',
};

function statusOf(it) {
  if (it.review) return it.selected != null ? 'answered-review' : 'review';
  if (it.selected != null) return 'answered';
  return it.visited ? 'not-answered' : 'not-visited';
}

const clock = (s) => {
  const v = Math.max(0, Math.floor(s));
  const h = Math.floor(v / 3600);
  const mm = String(Math.floor((v % 3600) / 60)).padStart(2, '0');
  const ss = String(v % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// The exam screen. The server owns the deadline; this page only counts down to it.
// Every change is saved straight away, so a refresh or a closed tab loses nothing.
export default function AptitudeExam() {
  const { attemptId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [left, setLeft] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('saved'); // saved | saving | failed
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const offsetRef = useRef(0); // server clock minus browser clock
  const enteredRef = useRef(0); // when the current question was opened
  const doneRef = useRef(false);
  const pendingRef = useRef(0);

  const toResult = useCallback(() => {
    doneRef.current = true;
    navigate(`/aptitude/results/${attemptId}`, { replace: true });
  }, [attemptId, navigate]);

  const save = useCallback(async (index, body) => {
    pendingRef.current += 1;
    setSaving('saving');
    try {
      await apiRequest(`/aptitude/tests/attempts/${attemptId}/items/${index}`, { method: 'PATCH', body: JSON.stringify(body) });
      pendingRef.current -= 1;
      if (!pendingRef.current) setSaving('saved');
    } catch (e) {
      pendingRef.current -= 1;
      if (/submitted|time is up/i.test(e.message)) toResult();
      else setSaving('failed');
    }
  }, [attemptId, toResult]);

  // Load (or reload after a refresh).
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    apiRequest(`/aptitude/tests/attempts/${attemptId}`)
      .then((r) => {
        if (cancelled) return;
        if (r.result) return toResult();
        offsetRef.current = new Date(r.exam.serverNow).getTime() - Date.now();
        enteredRef.current = Date.now();
        const first = r.exam.items.findIndex((it) => !it.visited);
        const start = first === -1 ? 0 : first;
        setExam(r.exam);
        setItems(r.exam.items.map((it, i) => (i === start ? { ...it, visited: true } : it)));
        setCurrent(start);
        setLeft((new Date(r.exam.deadline).getTime() - Date.now() - offsetRef.current) / 1000);
        if (!r.exam.items[start]?.visited) save(start, { visited: true });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attemptId, user, toResult, save]);

  // Time spent on the question being left, added to what was saved before.
  const leave = useCallback(() => {
    const spent = (Date.now() - enteredRef.current) / 1000;
    enteredRef.current = Date.now();
    if (spent < 1) return null;
    const seconds = (items[current]?.seconds || 0) + spent;
    setItems((list) => list.map((it, i) => (i === current ? { ...it, seconds } : it)));
    return { index: current, seconds: Math.round(seconds) };
  }, [current, items]);

  const submit = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setSubmitting(true);
    try {
      await apiRequest(`/aptitude/tests/attempts/${attemptId}/submit`, { method: 'POST' });
    } catch {
      // The server closes overdue attempts on its own; the result page will show it.
    }
    navigate(`/aptitude/results/${attemptId}`, { replace: true });
  }, [attemptId, navigate]);

  // Countdown. When it reaches zero the test is submitted.
  useEffect(() => {
    if (!exam) return undefined;
    const deadline = new Date(exam.deadline).getTime();
    const timer = setInterval(() => {
      const s = (deadline - Date.now() - offsetRef.current) / 1000;
      setLeft(s);
      if (s <= 0) submit();
    }, 1000);
    return () => clearInterval(timer);
  }, [exam, submit]);

  // Warn before closing the tab (answers are saved, but the clock keeps running).
  useEffect(() => {
    if (!exam) return undefined;
    const warn = (e) => {
      if (doneRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [exam]);

  const go = (index) => {
    if (index < 0 || index >= items.length || index === current) return;
    const spent = leave();
    if (spent) save(spent.index, { seconds: spent.seconds });
    const wasVisited = items[index].visited;
    setItems((list) => list.map((it, i) => (i === index ? { ...it, visited: true } : it)));
    if (!wasVisited) save(index, { visited: true });
    setCurrent(index);
    setPaletteOpen(false);
  };

  const update = (patch) => {
    setItems((list) => list.map((it, i) => (i === current ? { ...it, ...patch } : it)));
    save(current, patch);
  };

  const finish = async () => {
    const spent = leave();
    if (spent) await save(spent.index, { seconds: spent.seconds });
    submit();
  };

  if (!user) {
    return (
      <main className="apt-page">
        <div className="container apt-body">
          <section className="apt-signin">
            <i className="bi bi-person-lock" aria-hidden="true" />
            <div><strong>Sign in to continue your test</strong><span>Your answers are saved to your account.</span></div>
            <Link to="/login" state={{ from: `/aptitude/exam/${attemptId}` }} className="apt-btn apt-btn-primary">Sign in</Link>
          </section>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="apt-page">
        <div className="container apt-body">
          <p className="apt-error">{error}</p>
          <Link to="/aptitude/tests" className="apt-btn">Back to tests</Link>
        </div>
      </main>
    );
  }

  if (!exam) return <main className="apt-page apt-exam-page"><div className="container apt-body"><div className="apt-qcard apt-skeleton tall" /></div></main>;

  const q = items[current];
  const counts = Object.keys(STATUS).reduce((m, k) => ({ ...m, [k]: items.filter((it) => statusOf(it) === k).length }), {});
  const answered = counts.answered + counts['answered-review'];
  const low = left != null && left < 60;

  return (
    <main className="apt-page apt-exam-page">
      <header className="apt-exam-bar">
        <div className="container apt-exam-bar-inner">
          <div className="apt-exam-title">
            <strong>{exam.test?.title || 'Mock test'}</strong>
            <span className={`apt-save is-${saving}`}>
              {saving === 'saving' && <><i className="bi bi-arrow-repeat" aria-hidden="true" /> Saving…</>}
              {saving === 'saved' && <><i className="bi bi-cloud-check" aria-hidden="true" /> All answers saved</>}
              {saving === 'failed' && <><i className="bi bi-exclamation-triangle" aria-hidden="true" /> Not saved. Check your connection.</>}
            </span>
          </div>
          <div className={`apt-timer${low ? ' is-low' : ''}`} role="timer" aria-live={low ? 'assertive' : 'off'} aria-label="Time left">
            <i className="bi bi-stopwatch" aria-hidden="true" /> {left == null ? '--:--' : clock(left)}
          </div>
          <button type="button" className="apt-btn apt-btn-primary" onClick={() => setConfirming(true)} disabled={submitting}>Submit test</button>
        </div>
      </header>

      <div className="container apt-exam">
        <section className="apt-qcard" aria-labelledby="apt-qnum">
          <div className="apt-qmeta">
            <strong id="apt-qnum">Question {current + 1} <span>of {items.length}</span></strong>
            <span className="apt-chip">{q.topicName}</span>
            <span className="apt-chip">+{exam.marksPerQuestion}{exam.negativeMarks ? ` / −${exam.negativeMarks}` : ''}</span>
          </div>
          <p className="apt-statement">{q.statement}</p>
          <div className="apt-options" role="radiogroup" aria-label="Options">
            {q.options.map((option, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={q.selected === i}
                className={`apt-option${q.selected === i ? ' is-selected' : ''}`}
                onClick={() => update({ selected: i })}
                disabled={submitting}
              >
                <span className="apt-letter">{LETTERS[i]}</span>
                <span>{option}</span>
              </button>
            ))}
          </div>
          <div className="apt-qactions">
            <div className="apt-qactions-left">
              <button type="button" className="apt-btn" onClick={() => update({ selected: null })} disabled={q.selected == null || submitting}>Clear</button>
              <button type="button" className={`apt-btn${q.review ? ' is-on' : ''}`} onClick={() => update({ review: !q.review })} disabled={submitting}>
                <i className={`bi ${q.review ? 'bi-flag-fill' : 'bi-flag'}`} aria-hidden="true" /> {q.review ? 'Marked for review' : 'Mark for review'}
              </button>
            </div>
            <div className="apt-qactions-right">
              <button type="button" className="apt-btn" onClick={() => go(current - 1)} disabled={current === 0}><i className="bi bi-chevron-left" aria-hidden="true" /> Previous</button>
              {current < items.length - 1
                ? <button type="button" className="apt-btn apt-btn-primary" onClick={() => go(current + 1)}>Save &amp; next <i className="bi bi-chevron-right" aria-hidden="true" /></button>
                : <button type="button" className="apt-btn apt-btn-primary" onClick={() => setConfirming(true)} disabled={submitting}>Finish</button>}
            </div>
          </div>
        </section>

        <aside className={`apt-palette${paletteOpen ? ' is-open' : ''}`} aria-label="Question palette">
          <button type="button" className="apt-palette-toggle" onClick={() => setPaletteOpen((o) => !o)} aria-expanded={paletteOpen}>
            <span>Questions · {answered}/{items.length} answered</span>
            <i className={`bi ${paletteOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true" />
          </button>
          <div className="apt-palette-body">
            <div className="apt-palette-grid">
              {items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  className={`apt-pal s-${statusOf(it)}${i === current ? ' is-current' : ''}`}
                  onClick={() => go(i)}
                  aria-label={`Question ${i + 1}: ${STATUS[statusOf(it)]}`}
                  aria-current={i === current ? 'true' : undefined}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <ul className="apt-legend">
              {Object.entries(STATUS).map(([k, label]) => (
                <li key={k}><span className={`apt-pal s-${k}`} aria-hidden="true">{counts[k]}</span> {label}</li>
              ))}
            </ul>
            <Link to="/aptitude/tests" className="apt-link small">Leave for now (the timer keeps running)</Link>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="apt-modal" role="dialog" aria-modal="true" aria-labelledby="apt-submit-title">
          <div className="apt-modal-card">
            <h2 id="apt-submit-title">Submit the test?</h2>
            <ul className="apt-submit-summary">
              <li><b>{answered}</b> answered</li>
              <li><b>{items.length - answered}</b> not answered</li>
              <li><b>{counts.review + counts['answered-review']}</b> marked for review</li>
            </ul>
            <p className="apt-muted">You can&apos;t change answers after submitting.</p>
            <div className="apt-modal-actions">
              <button type="button" className="apt-btn" onClick={() => setConfirming(false)} disabled={submitting}>Keep going</button>
              <button type="button" className="apt-btn apt-btn-primary" onClick={finish} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
