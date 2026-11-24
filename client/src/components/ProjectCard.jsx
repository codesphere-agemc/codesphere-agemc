import { Link } from 'react-router-dom';
import { STATUS, categoryOf } from '../lib/projects';
import ProfileAvatar from './ProfileAvatar';
import MemberLink from './MemberLink';
import '../css/Projects.css';

const DEFAULT_BANNER = '/default-profile-banner.webp';

// Project card used in the Showcase, My Projects and guided pages.
export default function ProjectCard({ p, showStatus = false }) {
  const cat = categoryOf(p.category);
  const st = STATUS[p.status];
  const coverUrl = p.cover || DEFAULT_BANNER;

  return (
    <article className="ph-card">
      <div
        className={`ph-card-cover ${!p.cover ? 'has-fallback' : ''}`}
        style={{ backgroundImage: `url("${encodeURI(coverUrl)}")` }}
      >
        {p.featured && <span className="ph-featured"><i className="bi bi-star-fill" aria-hidden="true" /> Featured</span>}
        {showStatus && st && <span className={`ph-status tone-${st.tone}`}><i className={`bi ${st.icon}`} aria-hidden="true" /> {st.label}</span>}
      </div>
      <div className="ph-card-body">
        <div className="ph-chips">
          <span className="ph-chip"><i className={`bi ${cat.icon}`} aria-hidden="true" /> {cat.label}</span>
          <span className={`ph-chip level-${p.level?.toLowerCase()}`}>{p.level}</span>
          {p.teamType === 'team' && <span className="ph-chip">Team</span>}
          {p.sourceType === 'guided' && <span className="ph-chip">Guided</span>}
        </div>
        <h3><Link to={`/projects/${p.slug}`} className="ph-stretch">{p.title}</Link></h3>
        {p.summary && <p className="ph-summary">{p.summary}</p>}
        {p.techStack?.length > 0 && <p className="ph-stack">{p.techStack.slice(0, 5).join(' · ')}</p>}
        <footer className="ph-card-foot">
          {p.owner && (
            <span className="ph-owner">
              <ProfileAvatar user={p.owner} name={p.owner.name} aria-hidden="true" />
              <MemberLink user={p.owner} style={{ position: 'relative', zIndex: 2 }}>
                {p.owner.name}
              </MemberLink>
              {p.contributorsCount > 1 && ` +${p.contributorsCount - 1}`}
            </span>
          )}
          <span className="ph-links" style={{ position: 'relative', zIndex: 2 }}>
            {p.githubUrl && <a href={p.githubUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label="GitHub repository"><i className="bi bi-github" /></a>}
            {p.demoUrl && <a href={p.demoUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label="Live demo"><i className="bi bi-box-arrow-up-right" /></a>}
          </span>
        </footer>
      </div>
    </article>
  );
}
