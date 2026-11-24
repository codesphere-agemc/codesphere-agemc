import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiRequest } from '../lib/api';
import { categoryOf } from '../lib/projects';
import { timeAgo } from '../lib/time';
import ProjectAnalytics from '../components/ProjectAnalytics';
import GuidedEditor from '../components/GuidedEditor';
import BroadcastOptions from '../components/BroadcastOptions';
import PushEmailButton from '../components/PushEmailButton';
import MemberLink from '../components/MemberLink';
import { useNotice } from '../context/NoticeContext';
import '../css/Projects.css';
import '../css/Host.css';

const TABS = [
  ['pending_review', 'Pending Review', 'bi-hourglass-split'],
  ['published', 'Published', 'bi-check2-circle'],
  ['changes_requested', 'Changes Requested', 'bi-arrow-repeat'],
  ['rejected', 'Rejected', 'bi-x-circle'],
  ['archived', 'Unpublished', 'bi-archive'],
  ['analytics', 'Analytics', 'bi-bar-chart'],
  ['guided', 'Guided Projects', 'bi-mortarboard'],
];
const QUEUE_TABS = ['pending_review', 'published', 'changes_requested', 'rejected', 'archived'];

const DECISION_TITLES = {
  approve: 'Project approved',
  unfeature: 'Project unfeatured',
  feature: 'Project featured',
  changes: 'Changes requested',
  reject: 'Project rejected',
  archive: 'Project unpublished',
};

const CHECKLIST = [
  'Explains the problem and what was built',
  'GitHub repository opens and matches the description',
  'Submitter\'s role is clear; collaborators credited',
  'Appropriate for a student showcase',
  'Links are safe and relevant',
  'License shown accurately; copied material attributed',
  'Screenshots readable, no secrets or personal data',
];

function FullProjectModal({ p, onClose }) {
  if (!p) return null;
  const cat = categoryOf(p.category);

  return (
    <div className="review-modal-backdrop" onClick={onClose} role="presentation">
      <div className="review-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <div className="review-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span className="host-kind"><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
            <h3 id="project-modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</h3>
          </div>
          <button type="button" className="review-modal-close" onClick={onClose} aria-label="Close modal">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="review-modal-body">
          <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', maxHeight: '280px', background: '#0B1A2B' }}>
            <img src={p.cover || '/default-profile-banner.webp'} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {p.summary && <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--navy)', marginBottom: '14px' }}>{p.summary}</p>}

          {(p.problem || p.solution) && (
            <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #EEF2F6' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy)' }}>Project Story</h4>
              {p.problem && (
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ fontSize: '0.82rem', color: '#64748B', textTransform: 'uppercase' }}>The Problem:</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--navy)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{p.problem}</p>
                </div>
              )}
              {p.solution && (
                <div>
                  <strong style={{ fontSize: '0.82rem', color: '#64748B', textTransform: 'uppercase' }}>What it does / Solution:</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--navy)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{p.solution}</p>
                </div>
              )}
            </div>
          )}

          {p.features?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy)' }}>Key Features</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--navy)', fontSize: '0.88rem' }}>
                {p.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {(p.contribution || p.outcomes || p.limitations) && (
            <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #EEF2F6' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy)' }}>Role & Learnings</h4>
              {p.contribution && <p style={{ margin: '0 0 8px', fontSize: '0.88rem' }}><strong>Role:</strong> {p.contribution}</p>}
              {p.outcomes && <p style={{ margin: '0 0 8px', fontSize: '0.88rem' }}><strong>Learnings:</strong> {p.outcomes}</p>}
              {p.limitations && <p style={{ margin: '0', fontSize: '0.88rem' }}><strong>Next Steps:</strong> {p.limitations}</p>}
            </div>
          )}

          {p.screenshots?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy)' }}>Screenshots ({p.screenshots.length})</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {p.screenshots.map((s, idx) => (
                  <a key={s.id || idx} href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                    <img src={s.url} alt={s.caption || `Screenshot ${idx + 1}`} style={{ width: '100%', height: '110px', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: '14px' }}>
            <strong style={{ display: 'block', color: '#92400E', fontSize: '0.85rem', marginBottom: '6px' }}><i className="bi bi-clipboard-check" /> Reviewer Checklist:</strong>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#78350F', fontSize: '0.82rem' }}>
              {CHECKLIST.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ p, onDone, onOpenPreview }) {
  const { showNotice } = useNotice();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [broadcastOptions, setBroadcastOptions] = useState({ sendNotification: true, sendEmail: true });
  const [error, setError] = useState('');
  const cat = categoryOf(p.category);

  const decide = async (decision) => {
    if (['changes', 'reject'].includes(decision) && note.trim().length < 5) {
      setError('Please provide feedback or reason in the note box so the student knows what to do.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/projects/admin/${p.id}/review`, { method: 'POST', body: JSON.stringify({ decision, note, ...broadcastOptions }) });
      showNotice({
        tone: 'success',
        kicker: 'Project submissions',
        title: DECISION_TITLES[decision] || 'Project updated',
        message: `"${p.title}" was updated.`,
      });
      onDone();
    } catch (e) {
      setError(e.message);
      showNotice({
        tone: 'error',
        kicker: 'Project submissions',
        title: 'Review action failed',
        message: e.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const statusClass = p.status === 'published' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending';

  return (
    <article className={`review-card-row status-${statusClass}`}>
      {/* 1. Left column: Banner / Cover */}
      <div className="review-col-banner">
        <div className="review-banner-container">
          <a href={p.cover || '/default-profile-banner.webp'} target="_blank" rel="noopener noreferrer" className="review-banner-link" title="Click to view full cover">
            <img src={p.cover || '/default-profile-banner.webp'} alt={`Cover for ${p.title}`} loading="lazy" />
          </a>
          <a href={p.cover || '/default-profile-banner.webp'} target="_blank" rel="noopener noreferrer" className="review-cover-badge">
            <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Open full
          </a>
        </div>
      </div>

      {/* 2. Middle column: Details */}
      <div className="review-col-details">
        <div className="review-details-top">
          <div className="review-badge-row">
            <span className="host-kind">
              <i className={`bi ${cat.icon}`} style={{ marginRight: '4px' }} />
              {cat.label}
            </span>
            <span className="review-badge-category">{p.level}</span>
            <span className="review-badge-category">{p.sourceType}</span>
            {p.teamType === 'team' && <span className="review-badge-category">Team</span>}
            {p.featured && (
              <span className="host-status approved" style={{ background: '#FEF3C7', color: '#92400E' }}>
                <i className="bi bi-star-fill" /> Featured
              </span>
            )}
            <span className={`host-status ${statusClass}`}>
              <i className={`bi ${p.status === 'published' ? 'bi-check-circle-fill' : p.status === 'rejected' ? 'bi-x-circle-fill' : 'bi-clock-fill'}`} />
              {p.status.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="host-muted review-host-info">
            <i className="bi bi-clock" aria-hidden="true" /> Submitted {p.submittedAt ? timeAgo(p.submittedAt) : '—'} by <strong><MemberLink user={p.owner}>{p.owner?.name}</MemberLink></strong>
            {p.ownerEmail && <> ({p.ownerEmail})</>}
          </span>
        </div>

        <h2 className="review-item-title">
          <Link to={`/projects/${p.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
            {p.title}
          </Link>
        </h2>
        {p.summary && <p className="review-item-tagline">{p.summary}</p>}

        <dl className="review-facts-grid">
          <div className="review-fact-item"><dt>Role</dt><dd>{p.contribution || 'Submitter / Author'}</dd></div>
          <div className="review-fact-item">
            <dt>Contributors</dt>
            <dd>{p.contributors?.length > 0 ? p.contributors.map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}`).join(', ') : 'Individual project'}</dd>
          </div>
          <div className="review-fact-item">
            <dt>Repository</dt>
            <dd>
              {p.github?.url ? (
                <a href={p.github.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: 'underline' }}>
                  <i className="bi bi-github" /> {p.github.owner ? `${p.github.owner}/${p.github.repo}` : 'GitHub Repository'}
                </a>
              ) : 'Not linked'}
            </dd>
          </div>
          <div className="review-fact-item">
            <dt>License</dt>
            <dd>{p.github?.license ? (p.github.licenseName || p.github.license) : p.license || '—'}</dd>
          </div>
          <div className="review-fact-item">
            <dt>Demo & Source</dt>
            <dd>
              {p.demoUrl ? (
                <a href={p.demoUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: 'underline' }}>
                  Live Demo
                </a>
              ) : 'No live demo'}
              {p.videoUrl ? ` · Demo video provided` : ''}
            </dd>
          </div>
          <div className="review-fact-item">
            <dt>Authorship Confirmed</dt>
            <dd>{p.authorshipConfirmed ? '✅ Confirmed' : 'No'}</dd>
          </div>
          {p.techStack?.length > 0 && (
            <div className="review-fact-item full-width">
              <dt>Tech Stack</dt>
              <dd className="review-prizes-list">
                {p.techStack.map((tech, idx) => (
                  <span key={idx} className="review-prize-tag" style={{ background: '#F1F5F9', borderColor: '#CBD5E1', color: '#1E293B' }}>
                    {tech}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <div className="review-details-footer">
          <div className="review-links">
            {p.github?.url && (
              <a href={p.github.url} target="_blank" rel="noopener noreferrer nofollow">
                <i className="bi bi-github" aria-hidden="true" /> GitHub
              </a>
            )}
            {p.demoUrl && (
              <a href={p.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
                <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Live Demo
              </a>
            )}
            {p.videoUrl && (
              <a href={p.videoUrl} target="_blank" rel="noopener noreferrer nofollow">
                <i className="bi bi-play-circle" aria-hidden="true" /> Video
              </a>
            )}
          </div>

          <button
            type="button"
            className="review-btn-preview"
            onClick={() => onOpenPreview(p)}
          >
            <i className="bi bi-file-earmark-richtext" aria-hidden="true" />
            View Description & Content
          </button>
        </div>

        {p.reviewNote && (
          <div className="host-review-note rejected" style={{ marginTop: '12px' }}>
            <strong><i className="bi bi-chat-left-text" /> Previous Review Note:</strong>
            <p>{p.reviewNote}</p>
          </div>
        )}
      </div>

      {/* 3. Right column: Actions */}
      <div className="review-col-actions">
        <h3 className="review-action-header">
          <i className="bi bi-sliders" aria-hidden="true" /> Review Action
        </h3>

        <div className="review-note-box">
          <label className="review-note-label">
            Feedback / Note for student {p.status === 'published' ? '(if unpublishing)' : '(required for changes/reject)'}:
          </label>
          <textarea
            className="review-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={p.status === 'published' ? 'Reason for unpublishing…' : 'Note for the student (what needs to be fixed or changed)…'}
            aria-label="Review note"
          />
        </div>

        {p.status !== 'published' && (
          <div className="review-broadcast-wrap">
            <BroadcastOptions value={broadcastOptions} onChange={setBroadcastOptions} />
          </div>
        )}

        <div className="review-buttons-stack">
          {p.status !== 'published' && (
            <button type="button" className="review-btn-approve" disabled={busy} onClick={() => decide('approve')}>
              <i className="bi bi-check-lg" aria-hidden="true" /> Approve & Publish
            </button>
          )}

          {p.status === 'published' && (
            <PushEmailButton kind="project" id={p.id} title={p.title} label="Email Broadcast" />
          )}

          {p.status === 'published' && (
            p.featured ? (
              <button type="button" className="host-btn" disabled={busy} onClick={() => decide('unfeature')}>
                <i className="bi bi-star" aria-hidden="true" /> Unfeature Project
              </button>
            ) : (
              <button type="button" className="host-btn" disabled={busy} onClick={() => decide('feature')}>
                <i className="bi bi-star-fill" style={{ color: '#F59E0B' }} aria-hidden="true" /> Feature in Showcase
              </button>
            )
          )}

          {p.status !== 'changes_requested' && (
            <button type="button" className="review-btn-reject" style={{ borderColor: '#FCD34D', color: '#B45309', background: '#FFFBEB' }} disabled={busy} onClick={() => decide('changes')}>
              <i className="bi bi-arrow-repeat" aria-hidden="true" /> Request Changes
            </button>
          )}

          {p.status !== 'rejected' && (
            <button type="button" className="review-btn-reject" disabled={busy} onClick={() => decide('reject')}>
              <i className="bi bi-x-lg" aria-hidden="true" /> Reject Submission
            </button>
          )}

          {p.status === 'published' && (
            <button type="button" className="review-btn-reject" disabled={busy} onClick={() => decide('archive')}>
              <i className="bi bi-archive" aria-hidden="true" /> Unpublish
            </button>
          )}

          <Link className="host-btn review-btn-live" to={`/projects/${p.slug}`} target="_blank">
            <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> View Project Page
          </Link>
        </div>

        {error && <p className="host-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export default function AdminProjects() {
  const [tab, setTab] = useState('pending_review');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [previewProject, setPreviewProject] = useState(null);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!QUEUE_TABS.includes(tab)) return undefined;
    let cancelled = false;
    apiRequest(`/projects/admin/queue?status=${tab}`).then((r) => !cancelled && setData(r)).catch((e) => !cancelled && setMessage(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab, version]);

  const items = data?.items;
  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const matchTitle = p.title?.toLowerCase().includes(q);
      const matchOwner = p.owner?.name?.toLowerCase().includes(q) || p.ownerEmail?.toLowerCase().includes(q);
      const matchTech = p.techStack?.some((t) => t.toLowerCase().includes(q));
      return matchTitle || matchOwner || matchTech;
    });
  }, [items, categoryFilter, search]);

  const pendingCount = data?.counts?.pending_review || 0;

  return (
    <>
      <Navbar />
      <main className="host-page review-page">
        <div className="container">
          <header className="host-head">
            <span className="host-eyebrow"><i className="bi bi-shield-check" aria-hidden="true" /> Project Moderation</span>
            <h1>Project submissions</h1>
            <p>Review student project showcases. Verify repo links, live demos, project details, and code authenticity before publishing.</p>
          </header>

          <div className="review-toolbar">
            <div className="review-tabs" role="tablist">
              {TABS.map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => {
                    if (id !== tab) {
                      setData(null);
                      setTab(id);
                    }
                  }}
                >
                  <i className={`bi ${icon || 'bi-folder'}`} style={{ marginRight: '4px' }} />
                  {label}
                  {id === 'pending_review' && pendingCount > 0 && <span>{pendingCount}</span>}
                </button>
              ))}
            </div>

            {QUEUE_TABS.includes(tab) && (
              <div className="review-filters">
                <div className="review-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by title, student, tech…"
                    aria-label="Filter submissions"
                  />
                </div>

                <select
                  className="review-type-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="all">All Categories</option>
                  <option value="web">Web Development</option>
                  <option value="ai-ml">AI & Machine Learning</option>
                  <option value="mobile">Mobile Apps</option>
                  <option value="cloud-devops">Cloud & DevOps</option>
                  <option value="open-source">Open Source</option>
                  <option value="data">Data Science</option>
                  <option value="dsa">DSA & Algorithms</option>
                  <option value="iot">IoT & Hardware</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
          </div>

          {message && <p className="host-ok" role="status">{message}</p>}

          {tab === 'analytics' && <ProjectAnalytics />}
          {tab === 'guided' && <GuidedEditor />}

          {QUEUE_TABS.includes(tab) && (
            <>
              {!data && <div className="host-skeleton" />}
              {data && filteredItems.length === 0 && (
                <div className="host-empty">
                  <span aria-hidden="true">
                    {search || categoryFilter !== 'all' ? '🔍' : '✅'}
                  </span>
                  <h2>
                    {search || categoryFilter !== 'all'
                      ? 'No matching projects found'
                      : tab === 'pending_review'
                      ? 'All caught up! No submissions awaiting review.'
                      : `No ${tab.replace(/_/g, ' ')} projects found.`}
                  </h2>
                  {(search || categoryFilter !== 'all') && (
                    <p style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="host-btn"
                        onClick={() => {
                          setSearch('');
                          setCategoryFilter('all');
                        }}
                      >
                        Clear filters
                      </button>
                    </p>
                  )}
                </div>
              )}

              {data && filteredItems.length > 0 && (
                <div className="review-cards-stack">
                  {filteredItems.map((p) => (
                    <ReviewCard
                      key={p.id}
                      p={p}
                      onDone={reload}
                      onOpenPreview={(item) => setPreviewProject(item)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {previewProject && (
        <FullProjectModal p={previewProject} onClose={() => setPreviewProject(null)} />
      )}
    </>
  );
}
