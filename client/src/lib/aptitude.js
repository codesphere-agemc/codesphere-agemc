// Shared bits for the Aptitude pages.

export const DIFFICULTY = {
  'very-easy': { label: 'Very easy', tone: 'green' },
  easy: { label: 'Easy', tone: 'blue' },
  medium: { label: 'Medium', tone: 'amber' },
  hard: { label: 'Hard', tone: 'red' },
};

export function formatDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 ? `${s % 60}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
