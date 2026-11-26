import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatDuration } from '../lib/aptitude';
import '../css/Aptitude.css';

// Quick-access cards. Sections still being built are marked and not clickable.
const QUICK = [
  { title: 'Practice Questions', text: 'Pick a topic and difficulty, answer, see the solution.', icon: 'bi-ui-checks-grid', to: '/aptitude/practice' },
  { title: 'Mock Tests', text: 'Timed tests with negative marking, like the real thing.', icon: 'bi-stopwatch', to: '/aptitude/tests' },
  { title: 'Placement Preparation', text: 'TCS NQT, Infosys, Wipro, Accenture and more.', icon: 'bi-briefcase', to: '#placement' },
  { title: 'Topic-wise Learning', text: '65 topics across 4 categories.', icon: 'bi-grid-3x3-gap', to: '#categories' },
  { title: 'Previous Tests', text: 'Review every test you have taken.', icon: 'bi-clock-history', to: '/aptitude/tests#previous' },
  { title: 'Leaderboard', text: 'Weekly and all-time aptitude rankings.', icon: 'bi-bar-chart-steps', to: '/aptitude/leaderboard' },
  { title: 'Daily Challenge', text: 'A fresh set every day. Keep your streak.', icon: 'bi-lightning-charge', to: '/aptitude/daily' },
  { title: 'My Performance', text: 'Accuracy, weak topics and progress charts.', icon: 'bi-graph-up-arrow', to: '/aptitude/progress' },
];

function Stat({ icon, value, label }) {
  return (
    <div className="apt-stat">
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

function QuickCard({ card }) {
  const body = (
    <>
      <span className="apt-quick-icon"><i className={`bi ${card.icon}`} aria-hidden="true" /></span>
      <strong>{card.title}</strong>
      <span>{card.text}</span>
      {!card.to && <em className="apt-soon">Coming soon</em>}
    </>
  );
  if (!card.to) return <div className="apt-quick is-soon" aria-disabled="true">{body}</div>;
  if (card.to.startsWith('#')) return <a href={card.to} className="apt-quick">{body}</a>;
  return <Link to={card.to} className="apt-quick">{body}</Link>;
}

export default function Aptitude() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest('/aptitude/catalog').then((r) => !cancelled && setCatalog(r)).catch((e) => !cancelled && setError(e.message));
    if (user) apiRequest('/aptitude/me').then((r) => !cancelled && setSummary(r.summary)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totalQuestions = catalog?.categories.reduce((sum, c) => sum + c.questions, 0) || 0;
  const firstName = user?.name?.split(' ')[0];

  return (
    <>
      <Navbar />
      <main className="apt-page">
        <header className="apt-hero">
          <div className="container apt-hero-inner">
            <div>
              <span className="apt-eyebrow"><i className="bi bi-calculator" aria-hidden="true" /> Aptitude Preparation</span>
              <h1>{firstName ? <>Ready to sharpen your problem-solving, <span>{firstName}</span>?</> : <>Sharpen your <span>problem-solving</span>.</>}</h1>
              <p>Quantitative aptitude, logical reasoning, verbal ability and data interpretation, with step-by-step solutions. Built for campus placements.</p>
              {summary && (
                <div className="apt-level">
                  <i className="bi bi-mortarboard-fill" aria-hidden="true" /> {summary.level.name}
                  {summary.level.next && <small>{summary.level.next.min - summary.questionsSolved} more solved to {summary.level.next.name}</small>}
                </div>
              )}
              {summary && (
                <Link to="/aptitude/mistakes" className="apt-level apt-level-link">
                  <i className="bi bi-journal-x" aria-hidden="true" /> Mistake notebook
                  <small>{summary.mistakes ? `${summary.mistakes} to review` : 'all clear'}</small>
                </Link>
              )}
            </div>
            <div className="apt-hero-count">
              <strong>{catalog ? totalQuestions : '…'}</strong>
              <span>questions in the bank</span>
            </div>
          </div>
        </header>

        <div className="container apt-body">
          {error && <p className="apt-error">{error}</p>}

          {user ? (
            <section className="apt-stats" aria-label="Your aptitude progress">
              {summary ? (
                <>
                  <Stat icon="bi-pencil-square" value={summary.questionsAttempted} label="Questions attempted" />
                  <Stat icon="bi-check2-circle" value={summary.questionsSolved} label="Solved correctly" />
                  <Stat icon="bi-bullseye" value={`${summary.accuracy}%`} label="Accuracy" />
                  <Stat icon="bi-hourglass-split" value={formatDuration(summary.practiceSeconds)} label="Practice time" />
                  <Stat icon="bi-fire" value={`${summary.streak} day${summary.streak === 1 ? '' : 's'}`} label="Current streak" />
                  <Stat icon="bi-gem" value={summary.xp} label="Aptitude XP" />
                </>
              ) : Array.from({ length: 6 }, (_, i) => <div key={i} className="apt-stat apt-skeleton" />)}
            </section>
          ) : (
            <section className="apt-signin">
              <i className="bi bi-person-lock" aria-hidden="true" />
              <div>
                <strong>Sign in to track your progress</strong>
                <span>Practice, tests, streaks and XP are saved to your CodeSphere account.</span>
              </div>
              <Link to="/login" state={{ from: '/aptitude' }} className="apt-btn apt-btn-primary">Sign in</Link>
            </section>
          )}

          <section className="apt-quick-grid" aria-label="Quick access">
            {QUICK.map((card) => <QuickCard key={card.title} card={card} />)}
          </section>

          <section id="categories" className="apt-section">
            <div className="apt-section-head">
              <h2>Topic-wise learning</h2>
              <p className="apt-muted">Choose a topic to see what's in it.</p>
            </div>
            {!catalog ? (
              <div className="apt-cat-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="apt-cat apt-skeleton tall" />)}</div>
            ) : (
              <div className="apt-cat-grid">
                {catalog.categories.map((c) => (
                  <article key={c.slug} className="apt-cat" style={{ '--cat': c.color }}>
                    <header>
                      <span className="apt-cat-icon"><i className={`bi ${c.icon}`} aria-hidden="true" /></span>
                      <div>
                        <h3>{c.name}</h3>
                        <small>{c.topics.length} topics · {c.questions} questions</small>
                      </div>
                    </header>
                    <p>{c.description}</p>
                    <ul className="apt-topic-list">
                      {c.topics.map((t) => (
                        <li key={t.slug}>
                          <Link to={`/aptitude/topics/${t.slug}`}>
                            {t.name}
                            <span className={t.questions ? '' : 'is-empty'}>{t.questions || 'soon'}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="placement" className="apt-section">
            <div className="apt-section-head">
              <h2>Placement preparation</h2>
              <p className="apt-muted">What each company usually tests. Patterns change between years, so always check the latest notice.</p>
            </div>
            <div className="apt-track-grid">
              {(catalog?.tracks || []).map((t) => (
                <div key={t.slug} className="apt-track">
                  <strong>{t.name}</strong>
                  <div className="apt-chips">
                    {t.categories.map((slug) => {
                      const c = catalog.categories.find((x) => x.slug === slug);
                      return c && <span key={slug} style={{ '--cat': c.color }}>{c.short}</span>;
                    })}
                  </div>
                  <Link to="/aptitude/tests" className="apt-link small">Mock tests <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
