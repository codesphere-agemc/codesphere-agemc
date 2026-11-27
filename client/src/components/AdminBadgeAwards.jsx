import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../lib/api';
import { useNotice } from '../context/NoticeContext';
import { loadBadgeCatalog } from '../lib/badges';
import '../css/Badges.css';

// Admin: view a student's badges and award/remove community badges.
export default function AdminBadgeAwards({ userId, userName }) {
  const { showNotice } = useNotice();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [earned, setEarned] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    Promise.all([loadBadgeCatalog(), apiRequest(`/badges/admin/user/${userId}`)])
      .then(([cat, list]) => {
        if (cancelled) return;
        setCatalog(cat);
        setEarned(list.badges);
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const refresh = async () => {
    const list = await apiRequest(`/badges/admin/user/${userId}`);
    setEarned(list.badges);
  };

  const award = async (badgeId) => {
    setBusy(badgeId);
    try {
      await apiRequest('/badges/admin/award', {
        method: 'POST',
        body: JSON.stringify({ userId, badgeId, note: notes[badgeId] || '' }),
      });
      await refresh();
      showNotice({
        tone: 'success',
        kicker: 'Community badges',
        title: 'Badge awarded',
        message: 'The student will see it next time they open their profile.',
      });
    } catch (err) {
      showNotice({
        tone: 'error',
        kicker: 'Community badges',
        title: "Couldn't award the badge",
        message: err.message || 'Please try again.',
      });
    } finally {
      setBusy('');
    }
  };

  const remove = async (badgeId) => {
    setBusy(badgeId);
    try {
      await apiRequest('/badges/admin/award', { method: 'DELETE', body: JSON.stringify({ userId, badgeId }) });
      await refresh();
      showNotice({
        tone: 'success',
        kicker: 'Community badges',
        title: 'Badge removed',
        message: "The badge has been removed from the student's profile.",
      });
    } catch (err) {
      showNotice({
        tone: 'error',
        kicker: 'Community badges',
        title: "Couldn't remove the badge",
        message: err.message || 'Please try again.',
      });
    } finally {
      setBusy('');
    }
  };

  const communityBadges = (catalog?.badges || []).filter((b) => b.type === 'admin');
  const earnedIds = new Set((earned || []).map((b) => b.id));

  return (
    <div className="adm-badges">
      <button
        type="button"
        className="adm-badges-toggle"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <i className="bi bi-award" aria-hidden="true" /> Badges
        {earned && <span className="adm-count-pill">{earned.length}</span>}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="adm-modal-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="adm-modal-card adm-modal-badges"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-badges-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-header">
              <div className="adm-modal-header-text">
                <h3 id="adm-badges-modal-title">
                  <i className="bi bi-award" aria-hidden="true" /> Badges & Recognition
                </h3>
                {userName && <p className="adm-modal-subtitle">Badges earned and community awards for <strong>{userName}</strong></p>}
              </div>
              <button
                type="button"
                className="adm-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close modal"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="adm-modal-body">
              {!earned && !loadError && (
                <div className="adm-modal-loading">
                  <i className="bi bi-arrow-repeat spin" />
                  <span>Loading badges catalog and user profile…</span>
                </div>
              )}

              {earned && (
                <>
                  <div className="adm-badge-section">
                    <div className="adm-badge-section-header">
                      <h4>Earned Badges ({earned.length})</h4>
                      <small>Automatic achievements & previously awarded badges</small>
                    </div>

                    {earned.length ? (
                      <div className="bdg-showcase adm-modal-showcase">
                        {earned.map((badge) => (
                          <span key={badge.id} className="bdg-chip" title={badge.note || badge.how}>
                            <span aria-hidden="true">{badge.emoji}</span> {badge.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="bdg-muted">No badges earned yet.</p>
                    )}
                  </div>

                  <div className="adm-badge-section">
                    <div className="adm-badge-section-header">
                      <h4>Community Badges (Award or Revoke)</h4>
                      <small>Special titles granted directly by administrators</small>
                    </div>

                    <ul className="adm-badges-list">
                      {communityBadges.map((badge) => {
                        const has = earnedIds.has(badge.id);
                        return (
                          <li key={badge.id} className={has ? 'is-awarded' : ''}>
                            <span className="adm-badge-name">
                              <span className="adm-badge-emoji" aria-hidden="true">{badge.emoji}</span>
                              <span className="adm-badge-texts">
                                <strong>{badge.name}</strong>
                                <small>{badge.how}</small>
                              </span>
                            </span>
                            {!has && (
                              <input
                                type="text"
                                maxLength={200}
                                placeholder="Optional reason / note..."
                                value={notes[badge.id] || ''}
                                onChange={(e) => setNotes((n) => ({ ...n, [badge.id]: e.target.value }))}
                                aria-label={`Note for ${badge.name}`}
                              />
                            )}
                            <button
                              type="button"
                              className={has ? 'is-remove' : 'is-award'}
                              onClick={() => (has ? remove(badge.id) : award(badge.id))}
                              disabled={busy === badge.id}
                            >
                              {busy === badge.id ? '…' : has ? 'Revoke' : 'Award'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              )}

              {loadError && (
                <div className="adm-badges-message" role="alert">
                  <i className="bi bi-exclamation-triangle" /> {loadError}
                </div>
              )}
            </div>

            <div className="adm-modal-footer">
              <span className="adm-modal-footer-hint">
                <i className="bi bi-info-circle" aria-hidden="true" />
                {earned ? `${earned.length} total badges earned` : 'Managing student badges'}
              </span>
              <button
                type="button"
                className="adm-modal-done-btn"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
