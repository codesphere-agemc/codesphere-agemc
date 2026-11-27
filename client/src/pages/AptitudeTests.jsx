import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import '../css/Aptitude.css';

const marking = (t) => `+${t.marksPerQuestion} / ${t.negativeMarks ? `−${t.negativeMarks}` : 'no negative'}`;
const formatDate = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Mock tests, plus the student's previous attempts.
export default function AptitudeTests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tests, setTests] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // test about to start
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/aptitude/tests').then((r) => !cancelled && setTests(r.tests)).catch((e) => !cancelled && setError(e.message));
    if (user) apiRequest('/aptitude/tests/attempts').then((r) => !cancelled && setAttempts(r.attempts)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (location.hash === '#previous' && attempts.length) document.getElementById('previous')?.scrollIntoView();
  }, [location.hash, attempts.length]);

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const r = await apiRequest(`/aptitude/tests/${confirm.slug}/start`, { method: 'POST' });
      navigate(`/aptitude/exam/${r.attemptId}`);
    } catch (e) {
      setError(e.message);
      setConfirm(null);
      setStarting(false);
    }
  };

  const action = (t) => {
    if (!user) return <Link to="/login" state={{ from: '/aptitude/tests' }} className="apt-btn apt-btn-primary">Sign in to start</Link>;
    if (t.inProgress) return <Link to={`/aptitude/exam/${t.inProgress}`} className="apt-btn apt-btn-primary"><i className="bi bi-play-fill" aria-hidden="true" /> Resume</Link>;
    if (!t.open) return <span className="apt-btn" aria-disabled="true">Closed</span>;
    if (t.maxAttempts && t.attemptsUsed >= t.maxAttempts) return <span className="apt-btn" aria-disabled="true">No attempts left</span>;
    return <button type="button" className="apt-btn apt-btn-primary" onClick={() => setConfirm(t)}><i className="bi bi-play-fill" aria-hidden="true" /> {t.attemptsUsed ? 'Take again' : 'Start test'}</button>;
  };

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero small">
          <div className="container">
            <Link to="/aptitude" className="apt-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Aptitude</Link>
            <span className="apt-eyebrow"><i className="bi bi-stopwatch" aria-hidden="true" /> Mock tests</span>
            <h1>Timed tests, real exam feel</h1>
            <p>Fresh questions every attempt, a server-side timer, negative marking and full solutions when you finish.</p>
          </div>
        </header>

        <div className="container apt-body">
          {error && <p className="apt-error">{error}</p>}
          <div className="apt-test-grid">
            {!tests && Array.from({ length: 4 }, (_, i) => <div key={i} className="apt-test apt-skeleton tall" />)}
            {tests?.length === 0 && <div className="apt-empty"><i className="bi bi-stopwatch" aria-hidden="true" /><h2>No tests yet</h2><p className="apt-muted">New mock tests are on the way.</p></div>}
            {tests?.map((t) => (
              <article key={t.id} className="apt-test">
                <h2>{t.title}</h2>
                <p className="apt-muted">{t.description}</p>
                <ul className="apt-test-facts">
                  <li><i className="bi bi-list-ol" aria-hidden="true" /> {t.questionCount} questions</li>
                  <li><i className="bi bi-clock" aria-hidden="true" /> {t.durationMinutes} min</li>
                  <li><i className="bi bi-plus-slash-minus" aria-hidden="true" /> {marking(t)}</li>
                  <li><i className="bi bi-arrow-repeat" aria-hidden="true" /> {t.maxAttempts ? `${t.attemptsUsed}/${t.maxAttempts} attempts` : 'Unlimited attempts'}</li>
                </ul>
                {t.sections.length > 1 && <div className="apt-chips">{t.sections.map((s) => <span key={s.name}>{s.name} · {s.count}</span>)}</div>}
                <div className="apt-test-foot">
                  {t.bestScore != null ? <span className="apt-best">Best: <b>{t.bestScore}</b></span> : <span />}
                  <div className="apt-test-actions">
                    {t.lastAttempt && <Link to={`/aptitude/results/${t.lastAttempt}`} className="apt-btn">Last result</Link>}
                    {action(t)}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {user && attempts.length > 0 && (
            <section id="previous" className="apt-section">
              <div className="apt-section-head"><h2>Previous tests</h2></div>
              <div className="apt-table-wrap">
                <table className="apt-table">
                  <thead><tr><th>Test</th><th>Date</th><th>Score</th><th>Correct / Wrong / Skipped</th><th /></tr></thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id}>
                        <td>{a.test?.title || 'Removed test'}{a.number > 1 && <small> · attempt {a.number}</small>}{a.status === 'auto-submitted' && <small> · time ran out</small>}</td>
                        <td>{formatDate(a.submittedAt)}</td>
                        <td><b>{a.score}</b> / {a.maxScore}</td>
                        <td>{a.correctCount} / {a.wrongCount} / {a.skippedCount}</td>
                        <td><Link to={`/aptitude/results/${a.id}`}>Review</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {confirm && (
          <div className="apt-modal" role="dialog" aria-modal="true" aria-labelledby="apt-start-title">
            <div className="apt-modal-card">
              <h2 id="apt-start-title">{confirm.title}</h2>
              <ul className="apt-rules">
                <li>{confirm.questionCount} questions in {confirm.durationMinutes} minutes. The timer starts now and keeps running if you close the page.</li>
                <li>Marking: {marking(confirm)} per question. Unanswered questions score 0.</li>
                <li>Answers save automatically. You can change them and mark questions for review.</li>
                <li>When time runs out, the test is submitted for you.</li>
              </ul>
              <div className="apt-modal-actions">
                <button type="button" className="apt-btn" onClick={() => setConfirm(null)} disabled={starting}>Cancel</button>
                <button type="button" className="apt-btn apt-btn-primary" onClick={start} disabled={starting}>{starting ? 'Starting…' : 'Begin test'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
