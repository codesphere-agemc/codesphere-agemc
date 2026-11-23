import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import '../css/RecentUpdates.css';

// Posts without their own banner get the CodeSphere banner.
const DEFAULT_BANNER = '/default-profile-banner.webp';

// "Recent updates": the latest 6 events, hackathons, recruitments/interviews,
// announcements and projects, as a swipeable strip of banner cards.
const KIND = {
  event: { icon: 'bi-calendar-event', tone: 'blue' },
  hackathon: { icon: 'bi-trophy', tone: 'purple' },
  recruitment: { icon: 'bi-person-badge', tone: 'orange' },
  update: { icon: 'bi-megaphone', tone: 'green' },
  project: { icon: 'bi-rocket-takeoff', tone: 'navy' },
};

const ago = (date) => {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function RecentUpdates() {
  const [items, setItems] = useState(null);
  const trackRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/stats/recent')
      .then((r) => !cancelled && setItems(r.items || []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items?.length) return null;

  const scroll = (dir) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector('.ru-card');
    track.scrollBy({ left: dir * ((card?.offsetWidth || 300) + 16), behavior: 'smooth' });
  };

  return (
    <section className="ru" aria-labelledby="ru-title">
      <div className="container">
        <div className="ru-head">
          <div>
            <span className="ru-eyebrow"><span className="ru-live" /> Happening now</span>
            <h2 id="ru-title">Recent updates from the community</h2>
          </div>
          <div className="ru-arrows">
            <button type="button" onClick={() => scroll(-1)} aria-label="Previous updates"><i className="bi bi-chevron-left" aria-hidden="true" /></button>
            <button type="button" onClick={() => scroll(1)} aria-label="More updates"><i className="bi bi-chevron-right" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="ru-track" ref={trackRef}>
          {items.map((item) => {
            const kind = KIND[item.kind] || KIND.update;
            return (
              <Link key={item.link} to={item.link} className={`ru-card ru-tone-${kind.tone} ${item.ended ? 'is-ended' : ''}`}>
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
                  {item.ended && (
                    <span className="ru-ended"><i className="bi bi-flag-fill" aria-hidden="true" /> {item.ended}</span>
                  )}
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
          })}
        </div>
      </div>
    </section>
  );
}
