import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { CATEGORIES, CATEGORY, fmt, formatDay, ordinal } from '../lib/results';
import { ScoreBreakdown, StatusChip } from './ResultParts';
import '../css/Results.css';

// Dashboard: every published result the member appears in, with their marks
// against each board's marking scheme.
export default function MyResults() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');

  const load = (signal) => apiRequest('/results/mine', { signal })
    .then((r) => setItems(r.results))
    .catch((e) => !signal?.aborted && setError(e.message || 'Unable to load your results.'));

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const summary = useMemo(() => {
    const list = items || [];
    const ranks = list.map((r) => r.entry.rank).filter(Boolean);
    return {
      count: list.length,
      best: ranks.length ? Math.min(...ranks) : null,
      average: list.length ? list.reduce((s, r) => s + r.entry.percent, 0) / list.length : 0,
      awards: list.filter((r) => r.entry.award || ['winner', 'runner-up', 'selected'].includes(r.entry.status)).length,
    };
  }, [items]);

  const present = CATEGORIES.filter((c) => items?.some((r) => r.category === c.id));
  const shown = (items || []).filter((r) => !category || r.category === category);

  return (
    <>
      <header className="dashboard-page-heading">
        <div>
          <span className="dashboard-page-kicker">YOUR CODESPHERE JOURNEY</span>
          <h1>My Results</h1>
          <p>Your hackathon, interview, contest and quiz results, with marks for each criterion.</p>
        </div>
        <Link to="/results" className="dashboard-primary-button">
          <i className="bi bi-clipboard-data" /> All community results
        </Link>
      </header>

      {error ? (
        <div className="dashboard-error" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button type="button" className="dashboard-secondary-button" onClick={() => { setError(''); load(); }}>
            <i className="bi bi-arrow-clockwise" /> Try again
          </button>
        </div>
      ) : !items ? (
        <section className="dashboard-loading-card" role="status">
          <span className="dashboard-loading-spinner" />
          <div>
            <strong>Loading your results</strong>
            <p>Fetching your scorecards...</p>
          </div>
        </section>
      ) : items.length === 0 ? (
        <div className="dashboard-empty-state">
          <div className="dashboard-empty-icon"><i className="bi bi-clipboard-data" /></div>
          <span className="dashboard-page-kicker">NOTHING YET</span>
          <h2>No results yet</h2>
          <p>When you take part in a hackathon, interview, contest or quiz, your scorecard shows up here after the organisers publish it.</p>
          <Link to="/hackathons" className="dashboard-primary-button">
            Find a hackathon <i className="bi bi-arrow-right" />
          </Link>
        </div>
      ) : (
        <div className="my-res">
          <div className="res-stats">
            <div><i className="bi bi-clipboard-check" aria-hidden="true" /><span><small>Results</small><strong>{summary.count}</strong></span></div>
            <div><i className="bi bi-trophy" aria-hidden="true" /><span><small>Best rank</small><strong>{summary.best ? ordinal(summary.best) : '—'}</strong></span></div>
            <div><i className="bi bi-graph-up" aria-hidden="true" /><span><small>Average score</small><strong>{fmt(Math.round(summary.average))}%</strong></span></div>
            <div><i className="bi bi-award" aria-hidden="true" /><span><small>Awards &amp; selections</small><strong>{summary.awards}</strong></span></div>
          </div>

          {present.length > 1 && (
            <div className="res-seg" role="tablist" aria-label="Result type">
              <button type="button" role="tab" aria-selected={!category} className={!category ? 'on' : ''} onClick={() => setCategory('')}>All <b>{items.length}</b></button>
              {present.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={category === c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>
                  <i className={`bi ${c.icon}`} aria-hidden="true" /> {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="my-res-list">
            {shown.map((r) => {
              const cat = CATEGORY[r.category] || CATEGORY.other;
              const e = r.entry;
              const passed = r.passPercent !== null && e.rank && e.percent >= r.passPercent;
              return (
                <article key={r.id} className={`my-res-card cat-${r.category}`}>
                  <div className="my-res-score">
                    <div className="res-ring size-md" style={{ '--p': `${e.percent}%` }}>
                      <div><strong>{fmt(Math.round(e.percent))}%</strong></div>
                    </div>
                    <span className="my-res-rank">{e.rank ? <>{ordinal(e.rank)} <small>of {r.participants}</small></> : 'Not ranked'}</span>
                  </div>
                  <div className="my-res-body">
                    <div className="res-tags">
                      <span className={`res-cat cat-${r.category}`}><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
                      <StatusChip status={e.status} />
                      {passed && !e.status && <span className="res-status tone-good">Qualified</span>}
                      {e.award && <span className="res-award"><i className="bi bi-award-fill" aria-hidden="true" /> {e.award}</span>}
                    </div>
                    <h3>{r.title}</h3>
                    <p className="res-muted small">
                      {r.organization}{r.heldOn ? ` · ${formatDay(r.heldOn)}` : ''}{e.subtitle ? ` · ${e.subtitle}` : ''} · <strong>{fmt(e.total)}</strong> / {fmt(r.maxTotal)} marks (average {fmt(r.average)})
                    </p>
                    <ScoreBreakdown criteria={r.criteria} entry={e} />
                    {e.remarks && <blockquote className="res-remarks"><i className="bi bi-chat-quote" aria-hidden="true" /> {e.remarks}</blockquote>}
                    <Link to={`/results/${r.slug}`} className="dashboard-event-link">
                      View full result <i className="bi bi-arrow-up-right" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
