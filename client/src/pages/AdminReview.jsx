import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import Navbar from '../components/Navbar';
import SafeText from '../components/SafeText';
import BroadcastOptions from '../components/BroadcastOptions';
import MemberLink from '../components/MemberLink';
import { apiRequest } from '../lib/api';
import { timeAgo } from '../lib/time';
import { useNotice } from '../context/NoticeContext';
import '../css/Host.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const TABS = [
  { id: 'pending', label: 'Pending Review', icon: 'bi-hourglass-split' },
  { id: 'approved', label: 'Approved', icon: 'bi-check2-circle' },
  { id: 'rejected', label: 'Rejected', icon: 'bi-x-circle' },
];

function FullPreviewModal({ item, onClose }) {
  if (!item) return null;

  const isHtml = /<[a-z][\s\S]*>/i.test(item.description || '');

  return (
    <div className="review-modal-backdrop" onClick={onClose} role="presentation">
      <div className="review-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="review-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="host-kind">{item.kind === 'event' ? `Event · ${item.category}` : 'Hackathon'}</span>
            <h3 id="modal-title">{item.title}</h3>
          </div>
          <button type="button" className="review-modal-close" onClick={onClose} aria-label="Close modal">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="review-modal-body">
          {item.bannerUrl && (
            <div style={{ marginBottom: '16px', borderRadius: '12px', overflow: 'hidden', maxHeight: '280px' }}>
              <img src={item.bannerUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          {item.tagline && <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--navy)', marginBottom: '12px' }}>{item.tagline}</p>}

          <h4 style={{ margin: '14px 0 8px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy)' }}>Description & Content</h4>
          {isHtml ? (
            <div
              className="safe-text"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.description || '') }}
            />
          ) : (
            <SafeText text={item.descriptionText || item.description} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ item, onDone, onOpenPreview }) {
  const { showNotice } = useNotice();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [broadcastOptions, setBroadcastOptions] = useState({ sendNotification: true, sendEmail: true });

  const decide = async (decision) => {
    if (decision === 'reject' && note.trim().length < 5) {
      setError('Write the reason so the host knows what to fix.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/host/admin/${item.kind}/${item.id}/review`, { method: 'POST', body: JSON.stringify({ decision, note, ...broadcastOptions }) });
      showNotice({
        tone: 'success',
        kicker: 'Hosted listings',
        title: decision === 'approve' ? 'Listing approved' : 'Listing sent back',
        message: decision === 'approve'
          ? `"${item.title}" is live now.`
          : `"${item.title}" was sent back with your note.`,
      });
      onDone();
    } catch (e) {
      showNotice({
        tone: 'error',
        kicker: 'Hosted listings',
        title: 'Review action failed',
        message: e.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const links = [
    ['bi-linkedin', 'LinkedIn', item.linkedinPostLink],
    ['bi-instagram', 'Instagram', item.instagramPostLink],
    ['bi-globe2', 'Website', item.websiteLink],
    ['bi-pencil-square', 'Registration', item.registrationLink],
    ['bi-camera-video', 'Meeting', item.meetingLink],
  ].filter(([, , url]) => url);

  return (
    <article className={`review-card-row status-${item.reviewStatus}`}>
      {/* 1. Left column: Banner */}
      <div className="review-col-banner">
        {item.bannerUrl ? (
          <div className="review-banner-container">
            <a href={item.bannerUrl} target="_blank" rel="noopener noreferrer" className="review-banner-link" title="Click to open full banner in new tab">
              <img src={item.bannerUrl} alt={`Banner for ${item.title}`} loading="lazy" />
            </a>
            <a href={item.bannerUrl} target="_blank" rel="noopener noreferrer" className="review-cover-badge">
              <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Open full
            </a>
          </div>
        ) : (
          <div className="review-banner-placeholder">
            <i className={item.kind === 'event' ? 'bi-calendar-event' : 'bi-trophy'} aria-hidden="true" />
            <span>No Cover Photo · {item.kind === 'event' ? 'Event' : 'Hackathon'}</span>
          </div>
        )}
      </div>

      {/* 2. Middle column: Details */}
      <div className="review-col-details">
        <div className="review-details-top">
          <div className="review-badge-row">
            <span className="host-kind">
              <i className={`bi ${item.kind === 'event' ? 'bi-calendar2-event' : 'bi-trophy'}`} style={{ marginRight: '4px' }} />
              {item.kind === 'event' ? 'Event' : 'Hackathon'}
            </span>
            {item.category && <span className="review-badge-category">{item.category}</span>}
            <span className={`host-status ${item.reviewStatus}`}>
              <i className={`bi ${item.reviewStatus === 'approved' ? 'bi-check-circle-fill' : item.reviewStatus === 'rejected' ? 'bi-x-circle-fill' : 'bi-clock-fill'}`} />
              {item.reviewStatus}
            </span>
          </div>
          <span className="host-muted review-host-info">
            <i className="bi bi-clock" aria-hidden="true" /> Submitted {timeAgo(item.submittedAt)} by <strong><MemberLink user={item.host}>{item.host?.name || item.hostName}</MemberLink></strong>
            {item.host?.email && <> ({item.host.email})</>}
          </span>
        </div>

        <h2 className="review-item-title">{item.title}</h2>
        {item.tagline && <p className="review-item-tagline">{item.tagline}</p>}

        <dl className="review-facts-grid">
          {item.kind === 'event' ? (
            <>
              <div className="review-fact-item"><dt>Starts</dt><dd>{fmt(item.date)}</dd></div>
              <div className="review-fact-item"><dt>Ends</dt><dd>{fmt(item.endDate)}</dd></div>
              <div className="review-fact-item"><dt>Mode & Venue</dt><dd>{item.mode}{item.venue ? ` · ${item.venue}` : ''}</dd></div>
            </>
          ) : (
            <>
              <div className="review-fact-item"><dt>Registration</dt><dd>{fmt(item.regStart)} → {fmt(item.regEnd)}</dd></div>
              <div className="review-fact-item"><dt>Submissions</dt><dd>{fmt(item.submissionStart)} → {fmt(item.submissionEnd)}</dd></div>
              <div className="review-fact-item"><dt>Mode · Team Size</dt><dd>{item.mode}{item.venue ? ` · ${item.venue}` : ''} · {item.teamMin}–{item.teamMax} members</dd></div>
              {item.tracks?.length > 0 && <div className="review-fact-item"><dt>Tracks</dt><dd>{item.tracks.join(', ')}</dd></div>}
              {item.prizes?.length > 0 && (
                <div className="review-fact-item full-width">
                  <dt>Prizes</dt>
                  <dd className="review-prizes-list">
                    {item.prizes.map((p, idx) => (
                      <span key={idx} className="review-prize-tag">
                        <i className="bi bi-award-fill" aria-hidden="true" />
                        {p.title}{p.reward ? `: ${p.reward}` : ''}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </>
          )}
          <div className="review-fact-item"><dt>Organiser</dt><dd>{item.hostName}</dd></div>
          <div className="review-fact-item">
            <dt>Contact</dt>
            <dd>
              <a href={`mailto:${item.contactEmail}`} style={{ textDecoration: 'underline' }}>{item.contactEmail}</a>
              {item.contactPhone && ` · ${item.contactPhone}`}
            </dd>
          </div>
        </dl>

        <div className="review-details-footer">
          {links.length > 0 && (
            <div className="review-links">
              {links.map(([icon, label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer nofollow">
                  <i className={`bi ${icon}`} aria-hidden="true" /> {label}
                </a>
              ))}
            </div>
          )}

          <button
            type="button"
            className="review-btn-preview"
            onClick={() => onOpenPreview(item)}
          >
            <i className="bi bi-file-earmark-richtext" aria-hidden="true" />
            View Description & Content
          </button>
        </div>

        {item.reviewNote && item.reviewStatus !== 'pending' && (
          <div className={`host-review-note ${item.reviewStatus}`}>
            <strong><i className="bi bi-chat-left-text" /> Note sent to host:</strong>
            <p>{item.reviewNote}</p>
          </div>
        )}
        {item.reviewStatus === 'pending' && item.reviewNote && (
          <div className="host-review-note rejected">
            <strong><i className="bi bi-arrow-repeat" /> Resubmitted after previous note:</strong>
            <p>{item.reviewNote}</p>
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
            Feedback / Note for host {item.reviewStatus === 'approved' ? '(to unpublish)' : '(if rejecting)'}:
          </label>
          <textarea
            className="review-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={item.reviewStatus === 'approved' ? 'Reason for unpublishing…' : 'Reason for rejection or what needs to be changed…'}
            aria-label="Note for the host"
          />
        </div>

        {item.reviewStatus !== 'approved' && (
          <div className="review-broadcast-wrap">
            <BroadcastOptions value={broadcastOptions} onChange={setBroadcastOptions} />
          </div>
        )}

        <div className="review-buttons-stack">
          {item.reviewStatus !== 'approved' && (
            <button type="button" className="review-btn-approve" disabled={busy} onClick={() => decide('approve')}>
              <i className="bi bi-check-lg" aria-hidden="true" /> Approve & Publish
            </button>
          )}

          <button type="button" className="review-btn-reject" disabled={busy} onClick={() => decide('reject')}>
            <i className="bi bi-x-lg" aria-hidden="true" /> {item.reviewStatus === 'approved' ? 'Unpublish Listing' : 'Reject / Send Back'}
          </button>

          {item.published && (
            <Link className="host-btn review-btn-live" to={item.kind === 'event' ? `/events/${item.slug}` : `/hackathons/${item.slug}`} target="_blank">
              <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> View Live Listing
            </Link>
          )}
        </div>

        {error && <p className="host-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export default function AdminReview() {
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [previewItem, setPreviewItem] = useState(null);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/host/admin/queue?status=${tab}`).then((r) => !cancelled && setData(r)).catch((e) => !cancelled && setMessage(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab, version]);

  const pendingCount = data ? Object.values(data.counts || {}).reduce((a, b) => a + b, 0) : 0;

  const items = data?.items;
  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchHost = item.hostName?.toLowerCase().includes(q) || item.host?.name?.toLowerCase().includes(q);
      const matchOrg = item.venue?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
      return matchTitle || matchHost || matchOrg;
    });
  }, [items, kindFilter, search]);

  return (
    <>
      <Navbar />
      <main className="host-page review-page">
        <div className="container">
          <header className="host-head">
            <span className="host-eyebrow"><i className="bi bi-shield-check" aria-hidden="true" /> Content Moderation</span>
            <h1>Review hosted listings</h1>
            <p>Review community-submitted events and hackathons. Verify dates, description details, links, and banners before approving to publish.</p>
          </header>

          <div className="review-toolbar">
            <div className="review-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'active' : ''}
                  onClick={() => {
                    if (t.id !== tab) {
                      setData(null);
                      setTab(t.id);
                    }
                  }}
                >
                  <i className={`bi ${t.icon}`} style={{ marginRight: '4px' }} />
                  {t.label}
                  {t.id === 'pending' && pendingCount > 0 && <span>{pendingCount}</span>}
                </button>
              ))}
            </div>

            <div className="review-filters">
              <div className="review-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by title, host, venue…"
                  aria-label="Filter submissions"
                />
              </div>

              <select
                className="review-type-select"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="all">All Types</option>
                <option value="event">Events Only</option>
                <option value="hackathon">Hackathons Only</option>
              </select>
            </div>
          </div>

          {message && <p className="host-ok" role="status">{message}</p>}
          {!data && <div className="host-skeleton" />}
          {data && filteredItems.length === 0 && (
            <div className="host-empty">
              <span aria-hidden="true">
                {search || kindFilter !== 'all' ? '🔍' : '✅'}
              </span>
              <h2>
                {search || kindFilter !== 'all'
                  ? 'No matching listings found'
                  : tab === 'pending'
                  ? 'All caught up! No submissions awaiting review.'
                  : `No ${tab} listings found.`}
              </h2>
              {(search || kindFilter !== 'all') && (
                <p style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    className="host-btn"
                    onClick={() => {
                      setSearch('');
                      setKindFilter('all');
                    }}
                  >
                    Clear filters
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="review-cards-stack">
            {filteredItems.map((item) => (
              <ReviewCard
                key={`${item.kind}-${item.id}`}
                item={item}
                onDone={reload}
                onOpenPreview={(i) => setPreviewItem(i)}
              />
            ))}
          </div>
        </div>
      </main>

      {previewItem && (
        <FullPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </>
  );
}
