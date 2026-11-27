import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { DIFFICULTY } from '../lib/aptitude';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TABS = [['open', 'To review'], ['understood', 'Understood'], ['all', 'All']];

// Every question answered wrong (in practice or a test), with its solution.
export default function AptitudeMistakes() {
  const { user } = useAuth();
  const [show, setShow] = useState('open');
  const [topic, setTopic] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    apiRequest(`/aptitude/mistakes?show=${show}`)
      .then((r) => !cancelled && setData({ ...r, show }))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user, show, version]);

  const act = async (id, request) => {
    setBusy(id);
    try {
      await request();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  const mark = (id, understood) => act(id, () => apiRequest(`/aptitude/mistakes/${id}`, { method: 'POST', body: JSON.stringify({ understood }) }));
  const remove = (id) => act(id, () => apiRequest(`/aptitude/mistakes/${id}`, { method: 'DELETE' }));

  const current = data?.show === show ? data : null;
  const topics = current ? [...new Map(current.items.map((i) => [i.topic, i.topicName])).entries()].sort((a, b) => a[1].localeCompare(b[1])) : [];
  const items = current ? current.items.filter((i) => !topic || i.topic === topic) : [];

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <span className="apt-eyebrow"><i className="bi bi-journal-x" aria-hidden="true" /> Mistake notebook</span>
            <h1>Learn from what went wrong</h1>
            <p>Every question you got wrong in practice or a mock test lands here with its solution. Mark it understood once it clicks.</p>
          </div>
        </header>

        <div className="container apt-body">
          {!user && (
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div><strong>Sign in to see your notebook</strong><span>Your mistakes are saved to your account.</span></div>
              <Link to="/login" state={{ from: '/aptitude/mistakes' }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          )}
          {error && <p className="apt-error">{error}</p>}

          {user && (
            <>
              <div className="apt-notebook-bar">
                <div className="apt-filter-tabs" role="tablist" aria-label="Show">
                  {TABS.map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={show === key} className={show === key ? 'is-on' : ''} onClick={() => { setShow(key); setTopic(''); }}>
                      {label}{data && key !== 'all' ? ` (${key === 'open' ? data.open : data.understood})` : ''}
                    </button>
                  ))}
                </div>
                {topics.length > 1 && (
                  <select className="apt-select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
                    <option value="">All topics</option>
                    {topics.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
                  </select>
                )}
              </div>

              {!current && <div className="apt-qcard apt-skeleton tall" />}
              {current && items.length === 0 && (
                <div className="apt-empty">
                  <i className="bi bi-emoji-smile" aria-hidden="true" />
                  <h2>{show === 'open' ? 'Nothing to review' : 'Nothing here yet'}</h2>
                  <p className="apt-muted">{show === 'open' ? 'Questions you get wrong will appear here with their solutions.' : 'Questions you mark as understood show here.'}</p>
                </div>
              )}

              <div className="apt-review-list">
                {items.map((q) => (
                  <article key={q.id} className={`apt-qcard apt-review ${q.understood ? 'is-correct' : 'is-wrong'}`}>
                    <div className="apt-qmeta">
                      <strong>{q.code}</strong>
                      <span className="apt-chip">{q.topicName}</span>
                      <span className={`apt-chip diff-${DIFFICULTY[q.difficulty]?.tone}`}>{DIFFICULTY[q.difficulty]?.label}</span>
                      <span className="apt-marks">{new Date(q.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <p className="apt-statement">{q.statement}</p>
                    <div className="apt-options">
                      {q.options.map((o, i) => (
                        <div key={i} className={`apt-option${i === q.answer ? ' is-correct' : ''}`}>
                          <span className="apt-letter">{LETTERS[i]}</span>
                          <span>{o}</span>
                          {i === q.answer && <i className="bi bi-check-circle-fill" aria-label="Correct answer" />}
                        </div>
                      ))}
                    </div>
                    <details className="apt-solution" open={!q.understood}>
                      <summary>Solution</summary>
                      <p className="apt-explain">{q.explanation}</p>
                      {q.shortcut && <p className="apt-explain"><b>Shortcut:</b> {q.shortcut}</p>}
                    </details>
                    <div className="apt-qactions">
                      <div className="apt-qactions-left">
                        {q.understood
                          ? <button type="button" className="apt-btn" onClick={() => mark(q.id, false)} disabled={busy === q.id}><i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Review again</button>
                          : <button type="button" className="apt-btn apt-btn-primary" onClick={() => mark(q.id, true)} disabled={busy === q.id}><i className="bi bi-check2" aria-hidden="true" /> Got it</button>}
                        <Link to={`/aptitude/practice?topic=${q.topic}`} className="apt-btn">Practise {q.topicName}</Link>
                      </div>
                      <div className="apt-qactions-right">
                        <button type="button" className="apt-btn" onClick={() => remove(q.id)} disabled={busy === q.id} aria-label="Remove from notebook"><i className="bi bi-trash" aria-hidden="true" /> Remove</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
