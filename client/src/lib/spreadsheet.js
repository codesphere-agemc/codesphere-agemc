// Read result sheets (.xlsx / .csv) in the browser and turn them into
// result entries. Nothing is uploaded: the organiser reviews the import in
// the editor and saves it like any other change.
import { STATUSES, newKey } from './results';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// ---------- Reading ----------

// Minimal CSV parser: quoted fields, escaped quotes, commas/semicolons/tabs.
export function parseCsv(text) {
  const clean = String(text).replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Returns [{ name, rows }] (rows are arrays of cell values).
export async function readSpreadsheet(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 5 MB. Remove extra sheets or columns and try again.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return [{ name: 'CSV', rows: parseCsv(await file.text()) }];
  }
  if (name.endsWith('.xls')) throw new Error('Old .xls files aren\'t supported. In Excel, use File → Save As → Excel Workbook (.xlsx), or export as CSV.');
  if (!name.endsWith('.xlsx')) throw new Error('Choose an Excel (.xlsx) or CSV file.');
  // Loaded only when someone imports a sheet.
  const { default: readExcelFile } = await import('read-excel-file/browser');
  try {
    const sheets = await readExcelFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data }));
  } catch {
    throw new Error('Couldn\'t read that file. Make sure it\'s a valid .xlsx workbook (not password-protected).');
  }
}

// ---------- Understanding the columns ----------

const text = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const norm = (s) => text(s).toLowerCase().replace(/\(.*?\)|\/\s*\d+(\.\d+)?|out of\s*\d+(\.\d+)?|max\.?\s*\d+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = text(v).replace(/,/g, '');
  if (!s || !/^[-+]?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
};

// "Idea (25)", "Tech /30", "Demo out of 20", "Score (max 50)" → 25 / 30 / 20 / 50.
export function maxFromHeader(header) {
  const m = text(header).match(/\(\s*(?:out of|max\.?)?\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\)|\/\s*(\d+(?:\.\d+)?)|out of\s*(\d+(?:\.\d+)?)|max\.?\s*(\d+(?:\.\d+)?)/i);
  const n = m && Number(m[1] || m[2] || m[3] || m[4]);
  return n > 0 ? n : null;
}

// A tidy maximum when the header doesn't say: 17 → 20, 72 → 100.
export function niceMax(values) {
  const top = Math.max(0, ...values);
  return [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100, 150, 200, 250, 300, 400, 500, 1000].find((n) => n >= top) || Math.ceil(top);
}

const cleanHeader = (h) => text(h).replace(/\(.*?\)|\/\s*\d+(\.\d+)?|out of\s*\d+(\.\d+)?/gi, '').replace(/\s+/g, ' ').trim();

// The header row is the first row (in the first 15) with at least two text cells.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const cells = rows[i].map(text).filter(Boolean);
    if (cells.length >= 2 && cells.filter((c) => toNumber(c) === null).length >= 2) return i;
  }
  return 0;
}

export const FIELD_OPTIONS = [
  { id: 'ignore', label: 'Don\'t import' },
  { id: 'name', label: 'Name / team name' },
  { id: 'identity', label: 'Email or username' },
  { id: 'subtitle', label: 'Project / role / college' },
  { id: 'members', label: 'Team members' },
  { id: 'status', label: 'Status (selected, winner…)' },
  { id: 'award', label: 'Award / prize' },
  { id: 'remarks', label: 'Remarks / feedback' },
  { id: 'adjustment', label: 'Bonus / penalty' },
  { id: 'new', label: 'New marking criterion' },
];

const RULES = [
  ['ignore', /^(s ?no|sl ?no|sr ?no|serial|rank|position|sno|no|id|roll ?no|percent(age)?|grade|timestamp)$/],
  ['members', /member|teammate|participants? names/],
  ['identity', /e ?mail|username|user ?id|handle/],
  ['adjustment', /bonus|penalty|adjust|deduction/],
  ['status', /^(status|result|outcome|decision|verdict|selection)$/],
  ['award', /award|prize|position won|title won/],
  ['remarks', /remark|comment|feedback|note|observation/],
  ['name', /^(name|full name|participant( name)?|candidate( name)?|team( name)?|student( name)?|applicant( name)?|contestant)$/],
  ['subtitle', /project|role|position applied|post|college|institute|track|department|branch|domain/],
  ['total', /total|overall|grand|sum|final score|aggregate/],
];

// Guess what each column is. Returns one target per column:
// a field id, 'crit:<key>' for an existing criterion, 'new' or 'ignore'.
export function guessMapping(headers, dataRows, criteria) {
  const numericCol = headers.map((_, c) => {
    const vals = dataRows.map((r) => r[c]).filter((v) => text(v) !== '');
    return vals.length > 0 && vals.filter((v) => toNumber(v) !== null).length / vals.length >= 0.8;
  });
  const used = new Set();
  const mapping = headers.map((h, c) => {
    const n = norm(h);
    if (!n) return 'ignore';
    const crit = criteria.find((k) => !used.has(k.key) && norm(k.name) && (norm(k.name) === n || (n.length > 3 && norm(k.name).includes(n)) || (norm(k.name).length > 3 && n.includes(norm(k.name)))));
    if (crit && numericCol[c]) {
      used.add(crit.key);
      return `crit:${crit.key}`;
    }
    const rule = RULES.find(([, re]) => re.test(n));
    if (rule) return rule[0];
    return numericCol[c] ? 'new' : 'ignore';
  });
  // Only a "Total" column and no per-criterion marks: use the total as the score.
  const hasMarks = mapping.some((m) => m === 'new' || m.startsWith('crit:'));
  return mapping.map((m) => (m === 'total' ? (hasMarks ? 'ignore' : 'new') : m));
}

const STATUS_WORDS = [
  ['winner', /^(winner|won|champion|1st|first|gold)/],
  ['runner-up', /runner|2nd|second|silver/],
  ['selected', /^(selected|hired|accepted|offer|yes)$/],
  ['qualified', /^(qualified|pass(ed)?|cleared)$/],
  ['shortlisted', /shortlist|next round/],
  ['waitlisted', /wait ?list|on hold|reserve/],
  ['not-qualified', /^(not qualified|fail(ed)?|disqualified from round)$/],
  ['not-selected', /^(not selected|rejected|no|declined)$/],
  ['absent', /^(absent|ab|no show|did not appear)$/],
  ['disqualified', /^(disqualified|dq)$/],
];

export function statusFrom(value) {
  const s = text(value).toLowerCase().replace(/[-_]+/g, ' ').trim();
  if (!s) return '';
  const exact = STATUSES.find((st) => st.id && (st.label.toLowerCase() === s || st.id.replace(/-/g, ' ') === s));
  if (exact) return exact.id;
  return STATUS_WORDS.find(([, re]) => re.test(s))?.[0] || '';
}

// ---------- Building entries ----------

// Returns { entries, newCriteria, skipped, overMax }.
export function buildImport({ headers, dataRows, mapping, criteria, replaceScheme }) {
  const newCriteria = [];
  const keyByCol = {};
  mapping.forEach((m, c) => {
    if (m === 'new') {
      const values = dataRows.map((r) => toNumber(r[c])).filter((v) => v !== null);
      const crit = { key: newKey(), name: cleanHeader(headers[c]).slice(0, 60) || `Criterion ${c + 1}`, description: '', maxMarks: maxFromHeader(headers[c]) || niceMax(values) || 10 };
      newCriteria.push(crit);
      keyByCol[c] = crit.key;
    } else if (m.startsWith('crit:') && !replaceScheme) {
      keyByCol[c] = m.slice(5);
    }
  });
  const scheme = replaceScheme ? newCriteria : [...criteria, ...newCriteria];
  const maxByKey = Object.fromEntries(scheme.map((k) => [k.key, Number(k.maxMarks)]));

  let skipped = 0;
  let overMax = 0;
  const entries = [];
  dataRows.forEach((row) => {
    const get = (field) => mapping.map((m, c) => (m === field ? text(row[c]) : '')).filter(Boolean);
    const name = get('name').join(' ').slice(0, 100);
    if (!name) {
      if (row.some((v) => text(v))) skipped += 1;
      return;
    }
    const scores = {};
    Object.entries(keyByCol).forEach(([c, key]) => {
      const n = toNumber(row[c]);
      if (n === null) return;
      if (n > maxByKey[key] || n < 0) overMax += 1;
      scores[key] = String(n);
    });
    const absent = Object.keys(keyByCol).some((c) => /^(ab|absent|-)$/i.test(text(row[c])));
    const adjustment = get('adjustment').map(toNumber).find((n) => n !== null);
    entries.push({
      key: newKey(),
      name,
      subtitle: get('subtitle').join(' · ').slice(0, 120),
      members: get('members').flatMap((m) => m.split(/[,;\n]+/)).map((m) => m.trim()).filter(Boolean).slice(0, 12),
      users: [],
      identities: get('identity').flatMap((v) => v.split(/[,;\s]+/)).filter(Boolean).slice(0, 12),
      scores,
      adjustment: adjustment ? String(adjustment) : '',
      status: statusFrom(get('status')[0]) || (absent ? 'absent' : ''),
      award: get('award').join(', ').slice(0, 80),
      remarks: get('remarks').join(' ').slice(0, 600),
    });
  });
  return { entries, newCriteria, skipped, overMax };
}

// ---------- Template ----------

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function templateCsv(criteria, noun = 'Participant') {
  const header = [`${noun} name`, 'Email or username', noun === 'Candidate' ? 'Role' : noun === 'Team' ? 'Project' : 'College', ...(noun === 'Team' ? ['Team members'] : []),
    ...criteria.map((c) => `${c.name} (${c.maxMarks})`), 'Bonus/penalty', 'Status', 'Award', 'Remarks'];
  const example = [noun === 'Team' ? 'Byte Busters' : 'Aarav Sharma', 'aarav@example.com', noun === 'Candidate' ? 'Web developer' : noun === 'Team' ? 'Campus Connect' : 'AGEMC', ...(noun === 'Team' ? ['Aarav Sharma, Diya Patel'] : []),
    ...criteria.map((c) => Math.round(Number(c.maxMarks) * 0.8)), '', noun === 'Candidate' ? 'Selected' : '', '', 'Great work'];
  return `\uFEFF${[header, example].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
