import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DIFFICULTY, formatDuration } from '../lib/aptitude';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const STATUSES = [
  ['', 'All questions'],
  ['new', 'Not attempted'],
  ['attempted', 'Attempted'],
  ['correct', 'Solved correctly'],
  ['wrong', 'Answered wrong'],
  ['bookmarked', 'Bookmarked'],
];

// Seconds since the question was shown; stops once it's answered.
function useTimer(running, resetKey) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef(0); // set when the question appears
  useEffect(() => {
    startRef.current = Date.now();
    const id = window.setTimeout(() => setSeconds(0), 0);
    return () => window.clearTimeout(id);
  }, [resetKey]);
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setSeconds(Math.round((Date.now() - startRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running, resetKey]);
  return [seconds, () => Math.round((Date.now() - startRef.current) / 1000)];
}

export default function AptitudePractice() {
  const { user } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [list, setList] = useState(null);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState({}); // per question: { selected, result, hint, busy }
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const category = params.get('category') || '';
  const topic = params.get('topic') || '';
  const difficulty = params.get('difficulty') || '';
  const status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  useEffect(() => {
    apiRequest('/aptitude/catalog').then(setCatalog).catch(() => {});
  }, []);

  // Load the filtered list (signed-in only).
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (topic) q.set('topic', topic);
    if (difficulty) q.set('difficulty', difficulty);
    if (status) q.set('status', status);
    q.set('page', String(page));
    apiRequest(`/aptitude/practice?${q}`)
      .then((r) => {
        if (cancelled) return;
        setList(r);
        setIndex((i) => (params.get('last') === '1' ? r.questions.length - 1 : Math.min(i, Math.max(0, r.questions.length - 1))));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, category, topic, difficulty, status, page]);

  const question = list?.questions[index];
  const st = (question && states[question.id]) || {};
  const answered = Boolean(st.result);
  const [elapsed, takeElapsed] = useTimer(Boolean(question) && !answered, question?.id);

  const topicsForCategory = useMemo(() => {
    if (!catalog) return [];
    return (category ? catalog.categories.filter((c) => c.slug === category) : catalog.categories)
      .flatMap((c) => c.topics.map((t) => ({ ...t, category: c.slug, categoryName: c.short })));
  }, [catalog, category]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'category') next.delete('topic');
    next.delete('page');
    next.delete('last');
    setParams(next, { replace: true });
    setIndex(0);
    setList(null);
  };

  const patch = (id, change) => setStates((s) => ({ ...s, [id]: { ...s[id], ...change } }));
  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3500);
  };

  const submit = async () => {
    if (st.selected === undefined || st.busy) return;
    patch(question.id, { busy: true });
    try {
      const r = await apiRequest(`/aptitude/questions/${question.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ selected: st.selected, seconds: takeElapsed() }),
      });
      patch(question.id, { result: r, busy: false });
      setList((l) => ({ ...l, questions: l.questions.map((x) => (x.id === question.id ? { ...x, state: r.correct || x.state === 'correct' ? 'correct' : 'wrong' } : x)) }));
      if (r.rewards?.length) flash(r.rewards.map((w) => `🎉 ${w.label}: +${w.xp} XP`).join('  ·  '));
    } catch (e) {
      patch(question.id, { busy: false });
      flash(e.message);
    }
  };

  const showHint = async () => {
    if (st.hint) return;
    try {
      const r = await apiRequest(`/aptitude/questions/${question.id}/hint`);
      patch(question.id, { hint: r.hint });
    } catch (e) {
      flash(e.message);
    }
  };

  const reveal = async () => {
    if (question.state !== 'correct' && !window.confirm('Show the solution? You won\'t earn XP for this question afterwards.')) return;
    try {
      const r = await apiRequest(`/aptitude/questions/${question.id}/reveal`, { method: 'POST' });
      patch(question.id, { result: { ...r, revealedOnly: true, correct: null, seconds: takeElapsed(), xp: 0 } });
    } catch (e) {
      flash(e.message);
    }
  };

  const toggleBookmark = async () => {
    try {
      const r = await apiRequest(`/aptitude/questions/${question.id}/bookmark`, { method: 'POST' });
      setList((l) => ({ ...l, questions: l.questions.map((x) => (x.id === question.id ? { ...x, bookmarked: r.bookmarked } : x)) }));
      flash(r.bookmarked ? 'Bookmarked for revision.' : 'Bookmark removed.');
    } catch (e) {
      flash(e.message);
    }
  };

  const retry = () => patch(question.id, { result: null, selected: undefined });

  const goPage = (p, last = false) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    if (last) next.set('last', '1');
    else next.delete('last');
    setParams(next);
    setIndex(0);
    setList(null);
  };
  const prev = () => (index > 0 ? setIndex(index - 1) : page > 1 && goPage(page - 1, true));
  const next = () => (index < list.questions.length - 1 ? setIndex(index + 1) : page < list.pages && goPage(page + 1));
  const position = list ? (page - 1) * 20 + index + 1 : 0;
  const atStart = position <= 1;
  const atEnd = list ? position >= list.total : true;

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="apt-page">
          <div className="container apt-body">
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div><strong>Sign in to practise</strong><span>Your answers, XP and streaks are saved to your CodeSphere account.</span></div>
              <Link to="/login" state={{ from: location.pathname + location.search }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const result = st.result;

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <div className="container apt-body apt-practice">
          <aside className="apt-filters" aria-label="Filters">
            <Link to="/aptitude" className="apt-back dark"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <h1>Practice</h1>
            <label>Category
              <select value={category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="">All categories</option>
                {catalog?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.questions})</option>)}
              </select>
            </label>
            <label>Topic
              <select value={topic} onChange={(e) => setFilter('topic', e.target.value)}>
                <option value="">All topics</option>
                {topicsForCategory.filter((t) => t.questions).map((t) => <option key={t.slug} value={t.slug}>{category ? t.name : `${t.categoryName} · ${t.name}`} ({t.questions})</option>)}
              </select>
            </label>
            <label>Difficulty
              <select value={difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
                <option value="">Any difficulty</option>
                {Object.entries(DIFFICULTY).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </label>
            <label>Show
              <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
                {STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            {list && <p className="apt-muted small">{list.total} question{list.total === 1 ? '' : 's'} match</p>}
            {(category || topic || difficulty || status) && (
              <button type="button" className="apt-link" onClick={() => { setParams({}, { replace: true }); setIndex(0); setList(null); }}>Clear filters</button>
            )}
          </aside>

          <section className="apt-qpanel" aria-live="polite">
            {error && <p className="apt-error">{error}</p>}
            {!list && !error && <div className="apt-qcard apt-skeleton tall" />}
            {list && !question && (
              <div className="apt-empty">
                <i className="bi bi-inbox" aria-hidden="true" />
                <h2>No questions here</h2>
                <p className="apt-muted">{status === 'bookmarked' ? 'Bookmark questions while practising to revise them here.' : status ? 'Try a different filter.' : 'Questions for this selection are being added.'}</p>
              </div>
            )}
            {question && (
              <article className="apt-qcard">
                <header className="apt-qhead">
                  <div className="apt-qmeta">
                    <strong>Question {position} <span>of {list.total}</span></strong>
                    <span className="apt-chip">{question.topicName}</span>
                    <span className={`apt-chip diff-${DIFFICULTY[question.difficulty]?.tone}`}>{DIFFICULTY[question.difficulty]?.label}</span>
                    <span className="apt-chip ghost"><i className="bi bi-clock" aria-hidden="true" /> ~{formatDuration(question.estimatedSeconds)}</span>
                    {question.state === 'correct' && <span className="apt-chip solved"><i className="bi bi-check2" aria-hidden="true" /> Solved</span>}
                  </div>
                  <div className="apt-qtools">
                    <span className={`apt-timer ${!answered && elapsed > question.estimatedSeconds ? 'over' : ''}`} aria-label="Time on this question">
                      <i className="bi bi-stopwatch" aria-hidden="true" /> {formatDuration(answered ? result.seconds : elapsed)}
                    </span>
                    <button type="button" className={`apt-icon-btn ${question.bookmarked ? 'on' : ''}`} onClick={toggleBookmark} aria-pressed={question.bookmarked} title={question.bookmarked ? 'Remove bookmark' : 'Bookmark'}>
                      <i className={`bi ${question.bookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'}`} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                {question.title && <h2 className="apt-qtitle">{question.title}</h2>}
                <p className="apt-statement">{question.statement}</p>

                <div className="apt-options" role="radiogroup" aria-label="Options">
                  {question.options.map((option, i) => {
                    let mark = '';
                    if (result) {
                      if (i === result.answer) mark = 'is-correct';
                      else if (i === result.selected && !result.correct) mark = 'is-wrong';
                    } else if (st.selected === i) mark = 'is-selected';
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={st.selected === i}
                        className={`apt-option ${mark}`}
                        onClick={() => !result && patch(question.id, { selected: i })}
                        disabled={Boolean(result)}
                      >
                        <span className="apt-letter">{LETTERS[i]}</span>
                        <span>{option}</span>
                        {mark === 'is-correct' && <i className="bi bi-check-circle-fill" aria-label="Correct answer" />}
                        {mark === 'is-wrong' && <i className="bi bi-x-circle-fill" aria-label="Your answer" />}
                      </button>
                    );
                  })}
                </div>

                {st.hint && !result && <div className="apt-hint"><i className="bi bi-lightbulb-fill" aria-hidden="true" /> {st.hint}</div>}

                {result && (
                  <div className={`apt-result ${result.revealedOnly ? 'neutral' : result.correct ? 'ok' : 'bad'}`}>
                    <div className="apt-result-head">
                      <strong>
                        {result.revealedOnly ? <><i className="bi bi-eye" aria-hidden="true" /> Solution</> : result.correct ? <><i className="bi bi-check-circle-fill" aria-hidden="true" /> Correct!</> : <><i className="bi bi-x-circle-fill" aria-hidden="true" /> Not quite</>}
                      </strong>
                      <span>
                        Answer: <b>{LETTERS[result.answer]}. {question.options[result.answer]}</b>
                        {' · '}Time {formatDuration(result.seconds)}
                        {result.xp > 0 && <> · <b className="apt-xp">+{result.xp} XP</b></>}
                      </span>
                    </div>
                    <h3>Explanation</h3>
                    <p className="apt-explain">{result.explanation}</p>
                    {result.shortcut && (
                      <>
                        <h3><i className="bi bi-lightning-charge-fill" aria-hidden="true" /> Shortcut</h3>
                        <p className="apt-explain">{result.shortcut}</p>
                      </>
                    )}
                    {result.revealedOnly && result.xpForfeited && <p className="apt-muted small">You looked at the solution first, so this question won&apos;t earn XP.</p>}
                  </div>
                )}

                <div className="apt-qactions">
                  <div className="apt-qactions-left">
                    {!result ? (
                      <>
                        <button type="button" className="apt-btn apt-btn-primary" onClick={submit} disabled={st.selected === undefined || st.busy}>
                          {st.busy ? 'Checking…' : 'Submit answer'}
                        </button>
                        {question.hasHint && <button type="button" className="apt-btn" onClick={showHint} disabled={Boolean(st.hint)}><i className="bi bi-lightbulb" aria-hidden="true" /> Hint</button>}
                        <button type="button" className="apt-btn" onClick={reveal}><i className="bi bi-eye" aria-hidden="true" /> Show solution</button>
                      </>
                    ) : (
                      <button type="button" className="apt-btn" onClick={retry}><i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Retry</button>
                    )}
                  </div>
                  <div className="apt-qactions-right">
                    <button type="button" className="apt-btn" onClick={prev} disabled={atStart}><i className="bi bi-chevron-left" aria-hidden="true" /> Previous</button>
                    <button type="button" className={`apt-btn ${result ? 'apt-btn-primary' : ''}`} onClick={next} disabled={atEnd}>Next <i className="bi bi-chevron-right" aria-hidden="true" /></button>
                  </div>
                </div>
              </article>
            )}
          </section>
        </div>
        {toast && <div className="apt-toast" role="status">{toast}</div>}
      </main>
      <Footer />
    </>
  );
}
