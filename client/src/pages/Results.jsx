import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { CATEGORIES, CATEGORY, fmt, formatDay, ordinal } from '../lib/results';
import '../css/Results.css';

// Community: every published result board (hackathons, interviews, contests…).
export default function Results() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({});
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const isStaff = user?.role === 'admin' || user?.staffRoles?.includes('hackathon-organizer');

  useEffect(() => {
    let cancelled = false;
    apiRequest('/results')
      .then((r) => {
        if (cancelled) return;
        setItems(r.results);
        setCounts(r.counts || {});
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((r) => (!category || r.category === category)
      && (!q || `${r.title} ${r.organization} ${r.summary}`.toLowerCase().includes(q)));
  }, [items, category, query]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mine = items?.filter((r) => r.mine).length || 0;

  return (
    <>
      <Navbar />
      <main className="res-page">
        <header className="res-hero">
          <div className="container res-hero-inner">
            <div>
              <span className="res-eyebrow"><i className="bi bi-clipboard-data" aria-hidden="true" /> Community results</span>
              <h1>Results &amp; <span>scorecards</span></h1>
              <p>Hackathon standings, interview outcomes, contests and quizzes. Each board shows its marking scheme, so you can see how every mark was awarded.</p>
            </div>
            <div className="res-hero-actions">
              {mine > 0 && (
                <Link to="/user/results" className="res-btn res-btn-ghost">
                  <i className="bi bi-person-check" aria-hidden="true" /> My results <b>{mine}</b>
                </Link>
              )}
              {isStaff && (
                <Link to="/admin/results" className="res-btn res-btn-primary">
                  <i className="bi bi-plus-lg" aria-hidden="true" /> Publish a result
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="container res-body">
          <div className="res-filters">
            <div className="res-seg" role="tablist" aria-label="Category">
              <button type="button" role="tab" aria-selected={!category} className={!category ? 'on' : ''} onClick={() => setCategory('')}>
                All <b>{total}</b>
              </button>
              {CATEGORIES.filter((c) => counts[c.id]).map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={category === c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>
                  <i className={`bi ${c.icon}`} aria-hidden="true" /> {c.label} <b>{counts[c.id]}</b>
                </button>
              ))}
            </div>
            <label className="res-search">
              <i className="bi bi-search" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search results" aria-label="Search results" />
            </label>
          </div>

          {error && <p className="res-error">{error}</p>}
          {!items && !error && <p className="res-muted">Loading results…</p>}
          {items && shown.length === 0 && (
            <div className="res-empty">
              <i className="bi bi-clipboard-data" aria-hidden="true" />
              <h2>{items.length ? 'No results match' : 'No results published yet'}</h2>
              <p>When a hackathon, interview or contest wraps up, its scorecard appears here.</p>
            </div>
          )}

          <div className="res-grid">
            {shown.map((r) => {
              const cat = CATEGORY[r.category] || CATEGORY.other;
              return (
                <Link key={r.id} to={`/results/${r.slug}`} className={`res-card cat-${r.category} ${r.banner ? 'has-banner' : ''}`}>
                  {r.banner && <img src={r.banner} alt="" className="res-card-banner" loading="lazy" />}
                  <div className="res-card-top">
                    <span className={`res-cat cat-${r.category}`}><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
                    {r.mine && <span className="res-you-tag"><i className="bi bi-person-check-fill" aria-hidden="true" /> You took part</span>}
                  </div>
                  <small className="res-org">{r.organization}{r.heldOn && <> · {formatDay(r.heldOn)}</>}</small>
                  <h2>{r.title}</h2>
                  {r.summary && <p>{r.summary}</p>}

                  {r.top.length > 0 ? (
                    <ol className="res-mini-podium">
                      {r.top.map((t) => (
                        <li key={`${t.rank}-${t.name}`} className={`rank-${t.rank}`}>
                          <span className="res-medal">{ordinal(t.rank)}</span>
                          <strong>{t.name}</strong>
                          <em>{fmt(t.total)}<small>/{fmt(r.maxTotal)}</small></em>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="res-private-note"><i className="bi bi-lock" aria-hidden="true" /> Marks are shared privately with each {cat.noun.toLowerCase()}.</p>
                  )}

                  <div className="res-card-meta">
                    <span><i className="bi bi-people" aria-hidden="true" /> {r.participants} {r.noun}</span>
                    <span><i className="bi bi-list-check" aria-hidden="true" /> {r.criteriaCount} criteria · {fmt(r.maxTotal)} marks</span>
                    <span><i className="bi bi-graph-up" aria-hidden="true" /> Avg {fmt(r.average)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
