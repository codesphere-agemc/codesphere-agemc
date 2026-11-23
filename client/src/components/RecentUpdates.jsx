import { useEffect, useRef, useState } from 'react';
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
  result: { icon: 'bi-award', tone: 'orange' },
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
  const scrollerRef = useRef(null);
  const hovering = useRef(false);
  const interacting = useRef(false);
  const resumeAt = useRef(0);
  const drag = useRef(null);
  const dragMoved = useRef(false);

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

  const hasItems = Boolean(items?.length);

  // Gentle auto-scroll that people can take over: it nudges scrollLeft each
  // frame, wraps seamlessly (the cards are listed twice), and stands aside
  // while someone hovers, swipes, drags or scrolls, resuming shortly after.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!hasItems || !el) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let last = 0;
    let pos = el.scrollLeft;

    const wrap = () => {
      const half = el.scrollWidth / 2;
      if (half <= 0) return;
      if (el.scrollLeft >= half) el.scrollLeft -= half;
      else if (el.scrollLeft <= 0 && interacting.current) el.scrollLeft += half;
    };

    const tick = (time) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(time - last, 50) : 16;
      last = time;
      const busy = hovering.current || interacting.current || Date.now() < resumeAt.current || document.hidden;
      if (busy) {
        pos = el.scrollLeft;
        return;
      }
      const card = el.querySelector('.ru-card');
      const speed = ((card?.offsetWidth || 300) + 16) / (SECONDS_PER_CARD * 1000); // px per ms
      pos += speed * dt;
      el.scrollLeft = pos;
      if (el.scrollLeft >= el.scrollWidth / 2) {
        pos -= el.scrollWidth / 2;
        el.scrollLeft = pos;
      }
    };
    if (!reduced) frame = requestAnimationFrame(tick);

    // Manual scrolling (finger, trackpad, wheel, drag) keeps looping too.
    const onScroll = () => {
      if (interacting.current || Date.now() < resumeAt.current) wrap();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
    };
  }, [hasItems]);

  if (!hasItems) return null;

  const holdFor = (ms) => { resumeAt.current = Date.now() + ms; };

  // Mouse drag to scroll on desktop (touch scrolls natively).
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: scrollerRef.current.scrollLeft, moved: false };
    interacting.current = true;
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) scrollerRef.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    if (!drag.current) return;
    dragMoved.current = drag.current.moved;
    drag.current = null;
    interacting.current = false;
    holdFor(2000);
  };

  return (
    <section className="ru" aria-labelledby="ru-title">
      <div className="container">
        <div className="ru-head">
          <div>
            <span className="ru-eyebrow"><span className="ru-live" /> Happening now</span>
            <h2 id="ru-title">Recent updates from the community</h2>
          </div>
        </div>

        {/* Glides on its own and loops seamlessly (the cards are listed twice);
            swipe, scroll sideways or drag to move it by hand. */}
        <div
          ref={scrollerRef}
          className="ru-marquee"
          onMouseEnter={() => { hovering.current = true; }}
          onMouseLeave={() => { hovering.current = false; endDrag(); }}
          onTouchStart={() => { interacting.current = true; }}
          onTouchEnd={() => { interacting.current = false; holdFor(2500); }}
          onWheel={() => holdFor(2000)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onFocus={() => { hovering.current = true; }}
          onBlur={() => { hovering.current = false; }}
          // A drag shouldn't count as a click on the card under the mouse.
          onClickCapture={(e) => {
            if (dragMoved.current) {
              e.preventDefault();
              e.stopPropagation();
              dragMoved.current = false;
            }
          }}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="ru-marquee-track">
            {items.map((item) => <Card key={item.link} item={item} />)}
            {items.map((item) => <Card key={`copy-${item.link}`} item={item} copy />)}
          </div>
        </div>
      </div>
    </section>
  );
}
