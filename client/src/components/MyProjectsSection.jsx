import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { timeAgo } from '../lib/time';
import ProjectCard from './ProjectCard';
import GithubConnect from './GithubConnect';
import '../css/MyProjectsDashboard.css';

export default function MyProjectsSection({ preview = false }) {
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [invites, setInvites] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    if (preview) {
      return undefined;
    }

    let cancelled = false;

    Promise.all([
      apiRequest('/projects/mine').catch((err) => {
        throw err;
      }),
      apiRequest('/projects/team/invites').catch(() => ({ invites: [] })),
    ])
      .then(([mineData, inviteData]) => {
        if (cancelled) return;
        setMine(mineData);
        setInvites(inviteData.invites || []);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load your projects.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preview]);

  const projects = mine?.projects || [];
  const guided = mine?.guided || [];

  const filteredProjects = projects.filter((p) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'published') return p.status === 'published';
    if (activeFilter === 'draft') return ['draft', 'changes_requested'].includes(p.status);
    if (activeFilter === 'pending') return p.status === 'pending_review';
    return true;
  });

  return (
    <div className="my-projects-dashboard">
      <header className="dashboard-page-heading my-projects-page-heading">
        <div>
          <span className="dashboard-page-kicker">YOUR CODESPHERE WORKSPACE</span>
          <h1>My Projects</h1>
          <p>Manage your showcase projects, guided milestones, and community achievements.</p>
        </div>
        <div className="my-projects-header-actions">
          <Link to="/projects/new" className="dashboard-primary-button">
            <i className="bi bi-plus-lg" /> Add Project
          </Link>
          <Link to="/projects" className="dashboard-secondary-button">
            <i className="bi bi-compass" /> Projects Hub
          </Link>
        </div>
      </header>

      {/* 1. Projects Showcase Section */}
      <section className="my-projects-block">
        <div className="my-projects-section-header">
          <div className="my-projects-section-title">
            <div className="my-projects-title-icon">
              <i className="bi bi-kanban" />
            </div>
            <div>
              <h2>Showcase &amp; Portfolio Projects</h2>
              <p>Your public projects, team contributions, and drafts submitted for review.</p>
            </div>
          </div>

          <div className="my-projects-filter-pills" role="tablist" aria-label="Project status filter">
            {[
              { id: 'all', label: 'All', count: projects.length },
              { id: 'published', label: 'Published', count: projects.filter((p) => p.status === 'published').length },
              { id: 'pending', label: 'Under Review', count: projects.filter((p) => p.status === 'pending_review').length },
              { id: 'draft', label: 'Drafts', count: projects.filter((p) => ['draft', 'changes_requested'].includes(p.status)).length },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`my-projects-filter-pill ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.label} <span className="pill-count">{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        {invites.length > 0 && (
          <div className="my-projects-invites-banner">
            <div className="my-projects-invites-info">
              <i className="bi bi-envelope-open-fill" />
              <div>
                <strong>You have {invites.length} pending team {invites.length === 1 ? 'invitation' : 'invitations'}!</strong>
                <p>Collaborate with other creators on their projects.</p>
              </div>
            </div>
            <div className="my-projects-invites-list">
              {invites.map((inv) => (
                <Link key={inv.projectId} to={`/projects/${inv.slug}`} className="my-projects-invite-chip">
                  <span>{inv.title}</span> <small>by {inv.owner?.name}</small>
                  <i className="bi bi-arrow-right" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="my-projects-loading">
            <span className="dashboard-loading-spinner" />
            <p>Loading your projects...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error">
            <i className="bi bi-exclamation-circle" />
            <span>{error}</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="my-projects-empty-state">
            <div className="my-projects-empty-icon">
              <i className="bi bi-rocket-takeoff" />
            </div>
            <h3>{activeFilter === 'all' ? 'No projects added yet' : `No ${activeFilter} projects`}</h3>
            <p>
              {activeFilter === 'all'
                ? 'Import a repository from GitHub or create a project manually to showcase your skills.'
                : `You do not have any projects matching the "${activeFilter}" filter.`}
            </p>
            {activeFilter === 'all' && (
              <div className="my-projects-empty-actions">
                <Link to="/projects/new?mode=github" className="dashboard-primary-button">
                  <i className="bi bi-github" /> Import from GitHub
                </Link>
                <Link to="/projects/new?mode=manual" className="dashboard-secondary-button">
                  <i className="bi bi-pencil-square" /> Add manually
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="my-projects-grid">
            {filteredProjects.map((p) => (
              <div key={p.id} className="my-project-card-wrapper">
                <ProjectCard p={p} showStatus />
                <div className="my-project-card-footer">
                  <div className="my-project-time">
                    <i className="bi bi-clock-history" /> {timeAgo(p.updatedAt)}
                  </div>
                  <div className="my-project-actions">
                    <Link to={`/projects/${p.id}/edit`} className="my-project-btn-edit">
                      <i className="bi bi-pencil" /> Edit
                    </Link>
                    <Link to={`/projects/${p.slug}`} className="my-project-btn-view">
                      View <i className="bi bi-arrow-up-right" />
                    </Link>
                  </div>
                </div>
                {p.reviewNote && ['changes_requested', 'rejected'].includes(p.status) && (
                  <div className="my-project-review-note">
                    <strong><i className="bi bi-info-circle-fill" /> Reviewer feedback:</strong>
                    <p>{p.reviewNote}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {guided.length > 0 && (
          <div className="my-projects-guided-section">
            <div className="my-projects-section-subtitle">
              <h3><i className="bi bi-signpost-split" /> Guided Projects in Progress</h3>
              <p>Step-by-step projects you are building towards completion.</p>
            </div>
            <div className="my-projects-guided-grid">
              {guided.map((g) => (
                <div key={g.id} className="my-projects-guided-item">
                  <div className="my-projects-guided-info">
                    <h4>{g.title}</h4>
                    <span className="my-projects-guided-meta">
                      {g.level} · {g.milestoneCount} milestones
                    </span>
                  </div>
                  <Link to={`/projects/guided/${g.slug}`} className="dashboard-secondary-button">
                    Continue <i className="bi bi-arrow-right" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {!preview && (
          <div className="my-projects-github-connect-box">
            <GithubConnect />
          </div>
        )}
      </section>
    </div>
  );
}
