import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ShareButton from '../components/ShareButton';
import { apiRequest } from '../lib/api';
import { CATEGORY, STATUS, fmt, formatDay, ordinal } from '../lib/results';
import { ScoreBreakdown, StatusChip } from '../components/ResultParts';
import '../css/Results.css';

function ScoreRing({ percent, size = 'md' }) {
  return (
    <div className={`res-ring size-${size}`} style={{ '--p': `${percent}%` }} aria-label={`${fmt(percent)} percent`}>
      <div><strong>{fmt(Math.round(percent))}%</strong></div>
    </div>
  );
}

export default function ResultDetail() {
  const { slug } = useParams();
  // Keep the slug with the data, so a stale result never shows for a new slug.
  const [loaded, setLoaded] = useState({ slug: '', result: null, error: '' });
  const r = loaded.slug === slug ? loaded.result : null;
  const error = loaded.slug === slug ? loaded.error : '';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/results/${encodeURIComponent(slug)}`)
      .then((d) => !cancelled && setLoaded({ slug, result: d.result, error: '' }))
      .catch((e) => !cancelled && setLoaded({ slug, result: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const rows = useMemo(() => {
    if (!r) return [];
    const q = query.trim().toLowerCase();
    return r.entries.filter((e) => (!statusFilter || e.status === statusFilter)
      && (!q || `${e.name} ${e.subtitle} ${e.members.join(' ')}`.toLowerCase().includes(q)));
  }, [r, query, statusFilter]);

  if (error) {
    return (
      <>
        <Navbar />
        <main className="res-page"><div className="container res-body"><p className="res-error">{error}</p><Link to="/results" className="res-btn">Back to results</Link></div></main>
        <Footer />
      </>
    );
  }
  if (!r) {
    return (
      <>
        <Navbar />
        <main className="res-page"><div className="container res-body"><p className="res-muted">Loading result…</p></div></main>
      </>
    );
  }

  const cat = CATEGORY[r.category] || CATEGORY.other;
  const s = r.stats;
  const withScores = r.entries.some((e) => e.scores);
  const hasAdjust = r.entries.some((e) => e.adjustment);
  const podium = r.entries.filter((e) => e.rank && e.rank <= 3).slice(0, 3);
  const statuses = [...new Set(r.entries.map((e) => e.status).filter(Boolean))];
  const passed = (e) => r.passPercent !== null && e.rank && e.percent >= r.passPercent;
  const statCards = [
    { icon: 'bi-people', label: cat.noun === 'Team' ? 'Teams' : `${cat.noun}s`, value: s.participants },
    { icon: 'bi-bullseye', label: 'Maximum marks', value: fmt(s.maxTotal) },
    { icon: 'bi-arrow-up-circle', label: 'Highest', value: fmt(s.highest) },
    { icon: 'bi-graph-up', label: 'Average', value: fmt(s.average) },
    ...(s.qualified !== null ? [{ icon: 'bi-check2-circle', label: `Qualified (≥${fmt(r.passPercent)}%)`, value: s.qualified }] : []),
  ];

  return (
    <>
      <Navbar />
      <main className="res-page">
        <header className={`res-detail-hero cat-${r.category}`}>
          <div className="container">
            <Link to="/results" className="res-back"><i className="bi bi-arrow-left" aria-hidden="true" /> All results</Link>
            <div className="res-detail-head">
              <div>
                <span className={`res-cat on-dark cat-${r.category}`}><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
                {r.status !== 'published' && <span className="res-status tone-warn">Draft: only organisers can see this</span>}
                <h1>{r.title}</h1>
                <p className="res-lead">{r.organization}{r.heldOn && <> · {formatDay(r.heldOn)}</>}{r.summary && <> · {r.summary}</>}</p>
              </div>
              <div className="res-actions">
                {r.source?.kind === 'hackathon' && <Link to={`/hackathons/${r.source.slug}`} className="res-btn res-btn-ghost"><i className="bi bi-trophy" aria-hidden="true" /> Hackathon page</Link>}
                {r.source?.kind === 'recruitment' && <Link to={`/recruitments/${r.source.slug}`} className="res-btn res-btn-ghost"><i className="bi bi-person-badge" aria-hidden="true" /> Recruitment page</Link>}
                {r.canManage && <Link to={`/admin/results/${r.id}/edit`} className="res-btn res-btn-ghost"><i className="bi bi-pencil" aria-hidden="true" /> Edit</Link>}
                <ShareButton className="on-dark" title={r.title} path={`/results/${r.slug}`} />
              </div>
            </div>
          </div>
        </header>

        <div className="container res-body">
          {r.mine && (
            <section className="res-mine" aria-label="Your result">
              <ScoreRing percent={r.mine.percent} size="lg" />
              <div className="res-mine-main">
                <span className="res-kicker">YOUR RESULT</span>
                <h2>
                  {r.mine.rank ? <>{ordinal(r.mine.rank)} <small>of {s.participants}</small></> : 'Not ranked'}
                  {r.mine.award && <em className="res-award"><i className="bi bi-award-fill" aria-hidden="true" /> {r.mine.award}</em>}
                </h2>
                <p>
                  <strong>{fmt(r.mine.total)}</strong> / {fmt(s.maxTotal)} marks · class average {fmt(s.average)}
                  {' '}<StatusChip status={r.mine.status} />
                  {passed(r.mine) && !r.mine.status && <span className="res-status tone-good">Qualified</span>}
                </p>
                {r.mine.remarks && <blockquote className="res-remarks"><i className="bi bi-chat-quote" aria-hidden="true" /> {r.mine.remarks}</blockquote>}
              </div>
              <div className="res-mine-breakdown">
                <ScoreBreakdown criteria={r.criteria} entry={r.mine} averages={s.criteriaAverages} />
                <small className="res-muted"><span className="res-legend-avg" /> marks the average for each criterion</small>
              </div>
            </section>
          )}

          <div className="res-stats">
            {statCards.map((c) => (
              <div key={c.label}>
                <i className={`bi ${c.icon}`} aria-hidden="true" />
                <span><small>{c.label}</small><strong>{c.value}</strong></span>
              </div>
            ))}
          </div>

          {podium.length >= 2 && (
            <section className="res-podium" aria-label="Top ranks">
              {[podium.find((p) => p.rank === 2), podium.find((p) => p.rank === 1), podium.find((p) => p.rank === 3)]
                .filter(Boolean)
                .map((p) => (
                  <div key={p.id} className={`res-podium-step rank-${p.rank}`}>
                    <div className="res-podium-medal"><i className={`bi ${p.rank === 1 ? 'bi-trophy-fill' : 'bi-award-fill'}`} aria-hidden="true" /></div>
                    <strong>{p.name}</strong>
                    {p.subtitle && <small>{p.subtitle}</small>}
                    {p.award && <em>{p.award}</em>}
                    <div className="res-podium-block">
                      <span>{ordinal(p.rank)}</span>
                      <b>{fmt(p.total)}<small>/{fmt(s.maxTotal)}</small></b>
                    </div>
                  </div>
                ))}
            </section>
          )}

          <div className="res-detail-layout">
            <aside className="res-scheme">
              <h2><i className="bi bi-list-check" aria-hidden="true" /> Marking scheme</h2>
              <p className="res-muted small">Total of {fmt(s.maxTotal)} marks across {r.criteria.length} criteria{r.passPercent !== null ? `; ${fmt(r.passPercent)}% to qualify` : ''}.</p>
              <ul>
                {r.criteria.map((c) => {
                  const avg = s.criteriaAverages.find((a) => a.key === c.key)?.average || 0;
                  return (
                    <li key={c.key}>
                      <div className="res-scheme-row">
                        <strong>{c.name}</strong>
                        <span>{fmt(c.maxMarks)} <small>({Math.round((c.maxMarks / s.maxTotal) * 100)}%)</small></span>
                      </div>
                      {c.description && <p>{c.description}</p>}
                      <div className="res-weight" aria-hidden="true"><i style={{ width: `${(c.maxMarks / s.maxTotal) * 100}%` }} /></div>
                      <small className="res-muted">Average {fmt(avg)} / {fmt(c.maxMarks)}</small>
                    </li>
                  );
                })}
              </ul>
              {r.notes && (
                <div className="res-notes">
                  <h3>Notes from the organisers</h3>
                  <p>{r.notes}</p>
                </div>
              )}
            </aside>

            <section className="res-board">
              <div className="res-board-head">
                <h2><i className="bi bi-bar-chart-steps" aria-hidden="true" /> Scoreboard</h2>
                {r.entries.length > 0 && (
                  <div className="res-board-tools">
                    {statuses.length > 1 && (
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                        <option value="">Every status</option>
                        {statuses.map((st) => <option key={st} value={st}>{STATUS[st]?.label}</option>)}
                      </select>
                    )}
                    <label className="res-search small">
                      <i className="bi bi-search" aria-hidden="true" />
                      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find a ${cat.noun.toLowerCase()}`} aria-label={`Find a ${cat.noun.toLowerCase()}`} />
                    </label>
                  </div>
                )}
              </div>

              {r.visibility === 'private' && r.entries.length === 0 ? (
                <div className="res-private">
                  <i className="bi bi-shield-lock" aria-hidden="true" />
                  <div>
                    <strong>Marks are private</strong>
                    <p>Each {cat.noun.toLowerCase()} sees only their own result{r.mine ? ' (shown above)' : ''}. The marking scheme and overall statistics are public.</p>
                  </div>
                </div>
              ) : (
                <>
                  {r.visibility === 'totals' && !withScores && (
                    <p className="res-muted small"><i className="bi bi-info-circle" aria-hidden="true" /> Showing totals and ranks. Participants see their full breakdown on this page or in their dashboard.</p>
                  )}
                  <div className="res-table-wrap">
                    <table className="res-table">
                      <thead>
                        <tr>
                          <th scope="col">Rank</th>
                          <th scope="col">{cat.noun}</th>
                          {withScores && r.criteria.map((c) => <th key={c.key} scope="col" className="num" title={c.description}>{c.name}<small>/{fmt(c.maxMarks)}</small></th>)}
                          {withScores && hasAdjust && <th scope="col" className="num">+/−</th>}
                          <th scope="col" className="num">Total<small>/{fmt(s.maxTotal)}</small></th>
                          <th scope="col" className="num">%</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e) => {
                          const isMine = r.mine?.id === e.id;
                          const expandable = Boolean(e.remarks || e.members.length);
                          return [
                            <tr key={e.id} className={`${isMine ? 'is-mine' : ''} ${e.rank && e.rank <= 3 ? `top-${e.rank}` : ''} ${expandable ? 'expandable' : ''}`} onClick={expandable ? () => setOpen(open === e.id ? null : e.id) : undefined}>
                              <td><span className="res-rank">{e.rank ? ordinal(e.rank) : '—'}</span></td>
                              <td className="res-name">
                                <strong>{e.name}{isMine && <em className="res-you">You</em>}</strong>
                                {e.subtitle && <small>{e.subtitle}</small>}
                                {e.award && <small className="res-award-line"><i className="bi bi-award" aria-hidden="true" /> {e.award}</small>}
                              </td>
                              {withScores && r.criteria.map((c) => <td key={c.key} className="num">{e.scores?.[c.key] === undefined ? '—' : fmt(e.scores[c.key])}</td>)}
                              {withScores && hasAdjust && <td className="num">{e.adjustment ? `${e.adjustment > 0 ? '+' : ''}${fmt(e.adjustment)}` : ''}</td>}
                              <td className="num"><strong>{fmt(e.total)}</strong></td>
                              <td className="num">
                                <span className={`res-pct ${passed(e) ? 'pass' : ''}`}>{fmt(e.percent)}</span>
                              </td>
                              <td>
                                <StatusChip status={e.status} />
                                {expandable && <i className={`bi bi-chevron-${open === e.id ? 'up' : 'down'} res-expand`} aria-hidden="true" />}
                              </td>
                            </tr>,
                            open === e.id && (
                              <tr key={`${e.id}-more`} className="res-row-more">
                                <td colSpan={99}>
                                  {e.members.length > 0 && <p><strong>Members:</strong> {e.members.join(', ')}</p>}
                                  {e.remarks && <p><strong>Remarks:</strong> {e.remarks}</p>}
                                </td>
                              </tr>
                            ),
                          ];
                        })}
                      </tbody>
                    </table>
                    {rows.length === 0 && <p className="res-muted res-table-empty">No {cat.noun.toLowerCase()} matches.</p>}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
