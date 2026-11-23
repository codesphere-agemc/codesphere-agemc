import { STATUS, fmt } from '../lib/results';

// Small pieces shared by the result page and the dashboard.

export function StatusChip({ status }) {
  if (!status || !STATUS[status]) return null;
  return <span className={`res-status tone-${STATUS[status].tone || 'muted'}`}>{STATUS[status].label}</span>;
}

// Marks per criterion as bars against each criterion's maximum.
export function ScoreBreakdown({ criteria, entry, averages }) {
  return (
    <ul className="res-breakdown">
      {criteria.map((c) => {
        const marks = entry.scores?.[c.key];
        const pct = marks === undefined ? 0 : Math.min(100, (marks / c.maxMarks) * 100);
        const avg = averages?.find((a) => a.key === c.key)?.average;
        return (
          <li key={c.key}>
            <div className="res-breakdown-label">
              <span>{c.name}</span>
              <strong>{marks === undefined ? '—' : fmt(marks)}<small>/{fmt(c.maxMarks)}</small></strong>
            </div>
            <div className="res-bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
              {avg !== undefined && <b style={{ left: `${Math.min(100, (avg / c.maxMarks) * 100)}%` }} title={`Average ${fmt(avg)}`} />}
            </div>
          </li>
        );
      })}
      {Boolean(entry.adjustment) && (
        <li className="res-breakdown-adjust">
          <span>{entry.adjustment > 0 ? 'Bonus' : 'Penalty'}</span>
          <strong>{entry.adjustment > 0 ? '+' : ''}{fmt(entry.adjustment)}</strong>
        </li>
      )}
    </ul>
  );
}
