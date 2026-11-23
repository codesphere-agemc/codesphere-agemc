import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import '../css/RecentUpdates.css';

// Posts without their own banner get the CodeSphere banner.
const DEFAULT_BANNER = '/default-profile-banner.webp';
// Seconds each card takes to glide past (sets the marquee speed).
const SECONDS_PER_CARD = 6;
// How often the open page checks for new updates.
const REFRESH_MS = 2 * 60 * 1000;

// "Recent updates": the latest 6 items from every section (events, hackathons,
// recruitments, announcements, projects, guides, puzzles, guided projects and
// the Tech Brief), as a continuously gliding strip of banner cards.
const KIND = {
  event: { icon: 'bi-calendar-event', tone: 'blue' },
  hackathon: { icon: 'bi-trophy', tone: 'purple' },
  recruitment: { icon: 'bi-person-badge', tone: 'orange' },
  update: { icon: 'bi-megaphone', tone: 'green' },
  project: { icon: 'bi-rocket-takeoff', tone: 'navy' },
  guide: { icon: 'bi-journal-bookmark', tone: 'blue' },
  puzzle: { icon: 'bi-arrow-repeat', tone: 'purple' },
  guided: { icon: 'bi-signpost-split', tone: 'navy' },
  news: { icon: 'bi-newspaper', tone: 'green' },
};

const ago = (date) => {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function Card({ item, copy }) {
  const kind = KIND[item.kind] || KIND.update;
  return (
    <Link
      to={item.link}
      className={`ru-card ru-tone-${kind.tone} ${item.ended ? 'is-ended' : ''}`}
      // The second copy only exists to make the loop seamless.
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
    >
      <div className="ru-banner">
        <img
          src={item.image || DEFAULT_BANNER}
          alt=""
          loading="lazy"
          onError={(e) => {
            // A broken banner link also falls back to the CodeSphere banner.
            if (!e.currentTarget.src.endsWith(DEFAULT_BANNER)) e.currentTarget.src = DEFAULT_BANNER;
          }}
        />
        <span className="ru-label"><i className={`bi ${kind.icon}`} aria-hidden="true" /> {item.label}</span>
        {item.ended && <span className="ru-ended"><i className="bi bi-flag-fill" aria-hidden="true" /> {item.ended}</span>}
      </div>
      <div className="ru-body">
        <h3>{item.title}</h3>
        {item.text && <p>{item.text}</p>}
        <span className="ru-meta">
          {ago(item.at)}
          <span className="ru-go">View <i className="bi bi-arrow-right" aria-hidden="true" /></span>
        </span>
      </div>
    </Link>
  );
}

export default function RecentUpdates() {
  const [items, setItems] = useState(null);
  const [paused, setPaused] = useState(false);

  // Fetch now, then keep it fresh: every couple of minutes while the page is
  // open, and whenever the visitor comes back to the tab.
  useEffect(() => {
    let cancelled = false;
    const load = () => apiRequest('/stats/recent')
      .then((r) => !cancelled && setItems(r.items || []))
      .catch(() => !cancelled && setItems((current) => current || []));
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!items?.length) return null;

  return (
    <section className="ru" aria-labelledby="ru-title">
      <div className="container">
        <div className="ru-head">
          <div>
            <span className="ru-eyebrow"><span className="ru-live" /> Happening now</span>
            <h2 id="ru-title">Recent updates from the community</h2>
          </div>
        </div>

        {/* A smooth, endless marquee inside the page's content width: the cards
            are shown twice and slide left by exactly one set, so the loop has
            no visible jump. Hover, focus or a tap pauses it. */}
        <div
          className={`ru-marquee ${paused ? 'is-paused' : ''}`}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => window.setTimeout(() => setPaused(false), 3000)}
        >
          <div className="ru-marquee-track" style={{ '--ru-duration': `${items.length * SECONDS_PER_CARD}s` }}>
            {items.map((item) => <Card key={item.link} item={item} />)}
            {items.map((item) => <Card key={`copy-${item.link}`} item={item} copy />)}
          </div>
        </div>
      </div>
    </section>
  );
}
