import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../lib/api';
import { useNotice } from '../context/NoticeContext';

const ROLES = [
  { id: 'moderator', label: 'Moderator', icon: 'bi-shield-lock', help: 'Forum reports and moderation' },
  { id: 'news-editor', label: 'News editor', icon: 'bi-newspaper', help: 'Tech News review and digests' },
  { id: 'challenge-editor', label: 'Challenge editor', icon: 'bi-arrow-repeat', help: 'Reverse Coding authoring' },
  { id: 'project-reviewer', label: 'Project reviewer', icon: 'bi-kanban', help: 'Review Project Hub submissions' },
  { id: 'hackathon-organizer', label: 'Hackathon organizer', icon: 'bi-trophy', help: 'Run club hackathons and judge submissions' },
];

// Admin: grant or revoke a student's staff roles.
export default function AdminStaffRoles({ userId, userName, initial = [] }) {
  const { showNotice } = useNotice();
  const [roles, setRoles] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [saving, setSaving] = useState('');
  const [open, setOpen] = useState(false);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRoles(initial);
  }

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const toggle = async (role) => {
    const roleLabel = ROLES.find((item) => item.id === role)?.label || 'Staff role';
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setSaving(role);
    try {
      const r = await apiRequest(`/users/admin/${userId}/staff-roles`, { method: 'PUT', body: JSON.stringify({ staffRoles: next }) });
      setRoles(r.staffRoles);
      showNotice({
        tone: 'success',
        kicker: 'Staff roles',
        title: roles.includes(role) ? `${roleLabel} removed` : `${roleLabel} granted`,
        message: 'The staff roles for this student have been updated.',
      });
    } catch (e) {
      showNotice({
        tone: 'error',
        kicker: 'Staff roles',
        title: "Couldn't update staff roles",
        message: e.message || 'Please try again.',
      });
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="adm-staff" aria-label="Staff roles">
      <button
        type="button"
        className="adm-badges-toggle adm-staff-toggle"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <i className="bi bi-person-badge" aria-hidden="true" />
        Staff roles
        {roles.length > 0 && <span className="adm-count-pill">{roles.length}</span>}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="adm-modal-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="adm-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-staff-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-header">
              <div className="adm-modal-header-text">
                <h3 id="adm-staff-modal-title">
                  <i className="bi bi-person-badge" aria-hidden="true" /> Staff Roles
                </h3>
                {userName && <p className="adm-modal-subtitle">Managing staff permissions for <strong>{userName}</strong></p>}
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
              <p className="adm-modal-intro">
                Select the privileges this student can manage across CodeSphere. Changes apply immediately.
              </p>

              <div className="adm-staff-modal-grid">
                {ROLES.map((role) => {
                  const isOn = roles.includes(role.id);
                  const isSaving = saving === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      className={`adm-staff-modal-item ${isOn ? 'is-active' : ''}`}
                      onClick={() => toggle(role.id)}
                      disabled={isSaving}
                      aria-pressed={isOn}
                    >
                      <div className="adm-staff-item-icon">
                        <i className={`bi ${isSaving ? 'bi-hourglass-split' : isOn ? 'bi-check2-circle' : role.icon}`} aria-hidden="true" />
                      </div>
                      <div className="adm-staff-item-info">
                        <div className="adm-staff-item-head">
                          <strong>{role.label}</strong>
                          <span className={`adm-staff-badge-tag ${isOn ? 'on' : 'off'}`}>
                            {isOn ? 'Active' : 'Not granted'}
                          </span>
                        </div>
                        <small>{role.help}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="adm-modal-footer">
              <span className="adm-modal-footer-hint">
                <i className="bi bi-info-circle" aria-hidden="true" /> {roles.length} active {roles.length === 1 ? 'role' : 'roles'} granted
              </span>
              <button
                type="button"
                className="adm-modal-done-btn"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
