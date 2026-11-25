import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiRequest } from '../lib/api';
import { CATEGORY, fmt, formatDay } from '../lib/results';
import '../css/Results.css';

// Organisers: every result board, drafts included.
export default function AdminResults() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('all');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => apiRequest('/results/admin/all')
    .then((r) => setItems(r.results))
    .catch((e) => setMsg(e.message)), []);

  useEffect(() => {
    load();
  }, [load]);

  const setPublished = async (r, publish) => {
    try {
      await apiRequest(`/results/admin/${r.id}/publish`, { method: 'POST', body: JSON.stringify({ publish, notify: publish }) });
      setMsg(publish ? `"${r.title}" is published. Linked participants have been notified.` : `"${r.title}" is back to draft.`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.title}"? This removes every mark on it and cannot be undone.`)) return;
    try {
      await apiRequest(`/results/admin/${r.id}`, { method: 'DELETE' });
      setMsg(`Deleted "${r.title}".`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const drafts = items?.filter((r) => r.status === 'draft') || [];
  const shown = tab === 'draft' ? drafts : tab === 'published' ? (items || []).filter((r) => r.status === 'published') : items || [];

  return (
    <>
      <Navbar />
      <main className="res-page res-admin">
        <div className="container res-body">
          <div className="res-admin-head">
            <div>
              <h1><i className="bi bi-clipboard-data" aria-hidden="true" /> Results</h1>
              <p className="res-muted">Publish hackathon standings, interview marks and any other results, each with its own marking scheme.</p>
            </div>
            <div className="res-actions">
              <Link to="/results" className="res-btn">View page</Link>
              <Link to="/admin/results/new" state={{ openImport: true }} className="res-btn"><i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Upload Excel</Link>
              <Link to="/admin/results/new" className="res-btn res-btn-primary"><i className="bi bi-plus-lg" aria-hidden="true" /> New result</Link>
            </div>
          </div>

          <div className="res-seg" role="tablist" aria-label="Filter">
            {[['all', 'All', items?.length || 0], ['draft', 'Drafts', drafts.length], ['published', 'Published', (items?.length || 0) - drafts.length]].map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label} <b>{n}</b>
              </button>
            ))}
          </div>

          {msg && <p className="res-ok" role="status">{msg}</p>}
          {!items && <p className="res-muted">Loading…</p>}
          {items && shown.length === 0 && (
            <div className="res-empty">
              <i className="bi bi-clipboard-plus" aria-hidden="true" />
              <h2>No results here yet</h2>
              <p>Start from a template (hackathon, interview, contest, quiz…) or import teams and candidates you already have.</p>
              <Link to="/admin/results/new" className="res-btn res-btn-primary">Create a result</Link>
            </div>
          )}

          {shown.map((r) => {
            const cat = CATEGORY[r.category] || CATEGORY.other;
            return (
              <article key={r.id} className="res-admin-row">
                <div className="res-admin-main">
                  <div className="res-tags">
                    <span className={`res-cat cat-${r.category}`}><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
                    <span className={`res-status ${r.status === 'published' ? 'tone-good' : 'tone-warn'}`}>{r.status === 'published' ? 'Published' : 'Draft'}</span>
                    {r.visibility !== 'full' && <span className="res-status tone-muted"><i className="bi bi-lock" aria-hidden="true" /> {r.visibility === 'private' ? 'Private marks' : 'Totals only'}</span>}
                  </div>
                  <h2><Link to={`/results/${r.slug}`}>{r.title}</Link></h2>
                  <p className="res-muted small">
                    {r.organization}{r.heldOn ? ` · ${formatDay(r.heldOn)}` : ''} · {r.participants} {r.noun} · {r.criteriaCount} criteria ({fmt(r.maxTotal)} marks) · updated {formatDay(r.updatedAt)}
                  </p>
                </div>
                <div className="res-actions">
                  <Link to={`/results/${r.slug}`} className="res-btn">Preview</Link>
                  <Link to={`/admin/results/${r.id}/edit`} className="res-btn"><i className="bi bi-pencil" aria-hidden="true" /> Edit marks</Link>
                  {r.status === 'published'
                    ? <button type="button" className="res-btn" onClick={() => setPublished(r, false)}>Unpublish</button>
                    : <button type="button" className="res-btn res-btn-primary" onClick={() => setPublished(r, true)}>Publish</button>}
                  <button type="button" className="res-btn danger" onClick={() => remove(r)} aria-label={`Delete ${r.title}`}><i className="bi bi-trash" aria-hidden="true" /></button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
