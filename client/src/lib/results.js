// Shared helpers for the Results pages (community boards, editor, dashboard).

export const CATEGORIES = [
  { id: 'hackathon', label: 'Hackathon', icon: 'bi-trophy', noun: 'Team' },
  { id: 'interview', label: 'Interview', icon: 'bi-person-badge', noun: 'Candidate' },
  { id: 'contest', label: 'Coding contest', icon: 'bi-code-slash', noun: 'Participant' },
  { id: 'quiz', label: 'Quiz', icon: 'bi-patch-question', noun: 'Participant' },
  { id: 'assessment', label: 'Assessment', icon: 'bi-clipboard-check', noun: 'Participant' },
  { id: 'event', label: 'Event / Competition', icon: 'bi-calendar-event', noun: 'Participant' },
  { id: 'other', label: 'Other', icon: 'bi-clipboard-data', noun: 'Participant' },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const STATUSES = [
  { id: '', label: 'No status' },
  { id: 'winner', label: 'Winner', tone: 'gold' },
  { id: 'runner-up', label: 'Runner-up', tone: 'silver' },
  { id: 'selected', label: 'Selected', tone: 'good' },
  { id: 'qualified', label: 'Qualified', tone: 'good' },
  { id: 'shortlisted', label: 'Shortlisted', tone: 'info' },
  { id: 'waitlisted', label: 'Waitlisted', tone: 'warn' },
  { id: 'not-qualified', label: 'Not qualified', tone: 'muted' },
  { id: 'not-selected', label: 'Not selected', tone: 'muted' },
  { id: 'absent', label: 'Absent', tone: 'muted' },
  { id: 'disqualified', label: 'Disqualified', tone: 'bad' },
];
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

export const VISIBILITY = [
  { id: 'full', label: 'Full scorecard', hint: 'Everyone sees every participant\'s marks per criterion.' },
  { id: 'totals', label: 'Totals & ranks only', hint: 'Everyone sees totals and ranks. Each participant sees their own breakdown.' },
  { id: 'private', label: 'Private to each participant', hint: 'Each participant sees only their own result. Others see the scheme and statistics.' },
];

// Ready-made marking schemes. The organiser can edit any of them.
export const SCHEME_TEMPLATES = {
  hackathon: [
    { name: 'Innovation & originality', description: 'How new and creative is the idea?', maxMarks: 25 },
    { name: 'Technical complexity', description: 'Quality of engineering, architecture and code.', maxMarks: 25 },
    { name: 'Design & user experience', description: 'Ease of use, look and feel.', maxMarks: 20 },
    { name: 'Impact & feasibility', description: 'Real-world value and how practical it is to ship.', maxMarks: 20 },
    { name: 'Presentation & demo', description: 'Clarity of the pitch and live demo.', maxMarks: 10 },
  ],
  interview: [
    { name: 'Technical knowledge', description: 'Fundamentals for the role.', maxMarks: 30 },
    { name: 'Problem solving', description: 'Approach, reasoning and edge cases.', maxMarks: 25 },
    { name: 'Communication', description: 'Clarity and confidence while explaining.', maxMarks: 20 },
    { name: 'Projects & experience', description: 'Depth of past work.', maxMarks: 15 },
    { name: 'Attitude & team fit', description: 'Curiosity, ownership and collaboration.', maxMarks: 10 },
  ],
  contest: [
    { name: 'Problem A', description: 'Easy', maxMarks: 100 },
    { name: 'Problem B', description: 'Medium', maxMarks: 200 },
    { name: 'Problem C', description: 'Hard', maxMarks: 300 },
  ],
  quiz: [
    { name: 'Round 1', description: 'General', maxMarks: 20 },
    { name: 'Round 2', description: 'Rapid fire', maxMarks: 20 },
    { name: 'Final round', description: '', maxMarks: 30 },
  ],
  assessment: [
    { name: 'MCQ section', description: '', maxMarks: 40 },
    { name: 'Coding section', description: '', maxMarks: 60 },
  ],
  event: [
    { name: 'Performance', description: '', maxMarks: 50 },
    { name: 'Creativity', description: '', maxMarks: 30 },
    { name: 'Presentation', description: '', maxMarks: 20 },
  ],
  other: [{ name: 'Score', description: '', maxMarks: 100 }],
};

let keySeq = 0;
export const newKey = () => `c${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export const maxTotalOf = (criteria) => criteria.reduce((sum, c) => sum + (Number(c.maxMarks) || 0), 0);

// The same totals/ranks the server computes, for the live editor preview.
export function previewStandings(criteria, entries) {
  const maxTotal = maxTotalOf(criteria);
  const rows = entries.map((e) => {
    const marks = criteria.reduce((sum, c) => {
      const m = Number(e.scores?.[c.key]);
      return sum + (Number.isFinite(m) ? Math.min(m, Number(c.maxMarks) || 0) : 0);
    }, 0);
    const total = Math.max(0, Math.round((marks + (Number(e.adjustment) || 0)) * 100) / 100);
    return { ...e, total, percent: maxTotal ? Math.min(100, Math.round((total / maxTotal) * 10000) / 100) : 0 };
  });
  const ranked = rows.filter((r) => !['absent', 'disqualified'].includes(r.status)).sort((a, b) => b.total - a.total);
  const rankOf = new Map();
  ranked.forEach((r, i) => {
    const rank = i > 0 && ranked[i - 1].total === r.total ? rankOf.get(ranked[i - 1]) : i + 1;
    rankOf.set(r, rank);
  });
  return rows.map((r) => ({ ...r, rank: rankOf.get(r) ?? null }));
}

export const ordinal = (n) => {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n || 0).toFixed(2).replace(/\.?0+$/, ''));

export const formatDay = (date) => (date
  ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  : '');

export const toDateInput = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

// Parse pasted rows: "Name, email or @username, mark1, mark2, …" (comma or tab).
export function parsePastedRows(text, criteria) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((c) => c.trim()))
    .filter((cells) => cells[0] && !/^name$/i.test(cells[0]))
    .map((cells) => {
      const [name, identity, ...marks] = cells;
      const looksLikeId = identity && (identity.includes('@') || /^[a-z0-9-]{3,30}$/i.test(identity)) && Number.isNaN(Number(identity));
      const markCells = looksLikeId || identity === '' ? marks : [identity, ...marks];
      const scores = {};
      criteria.forEach((c, i) => {
        if (markCells[i] !== undefined && markCells[i] !== '') scores[c.key] = markCells[i];
      });
      return { key: newKey(), name, subtitle: '', members: [], users: [], identities: looksLikeId ? [identity] : [], scores, adjustment: '', status: '', award: '', remarks: '' };
    });
}
