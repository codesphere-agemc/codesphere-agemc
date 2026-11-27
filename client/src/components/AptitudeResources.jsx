// A list of external aptitude resources (IndiaBix, GeeksforGeeks, …).
// Links open in a new tab and say whether the site is free.
const pageName = (url) => {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  return last.replace(/\.(php|aspx|html)$/, '').replace(/^@/, '').replace(/-/g, ' ');
};

export default function AptitudeResources({ links, compact = false }) {
  if (!links?.length) return null;
  return (
    <ul className={`apt-res${compact ? ' compact' : ''}`}>
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            <span className="apt-res-main">
              <strong>{l.name}</strong>
              <span>{l.label || l.kind}{!compact && !l.label && ` · ${pageName(l.url)}`}</span>
            </span>
            <span className={`apt-res-cost${l.cost === 'Free' ? '' : ' paid'}`}>{l.cost}</span>
            <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
