import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiRequest } from '../lib/api';
import { DIFFICULTY } from '../lib/aptitude';
import { readSpreadsheet, MAX_FILE_BYTES } from '../lib/spreadsheet';
import '../css/Aptitude.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const STATUSES = ['draft', 'published', 'archived'];
const TABS = [['overview', 'Overview', 'bi-speedometer2'], ['questions', 'Questions', 'bi-list-check'], ['import', 'Bulk import', 'bi-upload'], ['tests', 'Mock tests', 'bi-stopwatch']];

const EMPTY_Q = { code: '', topic: '', difficulty: 'easy', statement: '', options: ['', '', '', ''], answer: 0, hint: '', explanation: '', shortcut: '', estimatedSeconds: 60, tags: '', tracks: [], status: 'draft' };
const EMPTY_T = { title: '', description: '', kind: 'mixed', track: '', mode: 'sections', questionCodes: '', sections: [{ name: '', category: 'quantitative', count: 10, difficulty: '' }], durationMinutes: 20, marksPerQuestion: 1, negativeMarks: 0.25, maxAttempts: 1, shuffleQuestions: true, shuffleOptions: false, opensAt: '', closesAt: '', status: 'draft' };

const TEMPLATE = [
  'code,topic,difficulty,question,option_a,option_b,option_c,option_d,answer,explanation,hint,shortcut,tags,status',
  ',percentage,easy,"What is 20% of 150?",30,25,35,20,A,"20% of 150 = 0.2 × 150 = 30.","Find 10% first.","10% is 15, so 20% is 30.",percent|basics,draft',
].join('\n');

const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const statusTone = { draft: 'ghost', published: 'solved', archived: 'diff-red' };

function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Spreadsheet rows (first row = headers) → plain objects with tidy keys.
function rowsToObjects(rows) {
  const [head, ...body] = rows;
  const keys = (head || []).map((h) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const alias = { statement: 'question', question_text: 'question', correct_answer: 'answer', correct: 'answer', a: 'option_a', b: 'option_b', c: 'option_c', d: 'option_d', e: 'option_e', f: 'option_f', time: 'estimated_seconds', seconds: 'estimated_seconds' };
  return body
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [alias[k] || k, r[i] instanceof Date ? r[i].toISOString() : r[i] ?? ''])));
}

// ---------- Question preview (what a student sees) ----------
function Preview({ q, topicName }) {
  return (
    <div className="apt-qcard apt-admin-preview">
      <div className="apt-qmeta">
        <strong>{q.code || 'New question'}</strong>
        {topicName && <span className="apt-chip">{topicName}</span>}
        <span className={`apt-chip diff-${DIFFICULTY[q.difficulty]?.tone}`}>{DIFFICULTY[q.difficulty]?.label}</span>
      </div>
      <p className="apt-statement">{q.statement || 'The question text appears here.'}</p>
      <div className="apt-options">
        {q.options.map((o, i) => (
          <div key={i} className={`apt-option${i === Number(q.answer) ? ' is-correct' : ''}`}>
            <span className="apt-letter">{LETTERS[i]}</span><span>{o || '…'}</span>
            {i === Number(q.answer) && <i className="bi bi-check-circle-fill" aria-label="Correct answer" />}
          </div>
        ))}
      </div>
      {q.hint && <div className="apt-hint"><i className="bi bi-lightbulb-fill" aria-hidden="true" /> {q.hint}</div>}
      <div className="apt-result neutral">
        <h3>Explanation</h3>
        <p className="apt-explain">{q.explanation || '…'}</p>
        {q.shortcut && <><h3>Shortcut</h3><p className="apt-explain">{q.shortcut}</p></>}
      </div>
    </div>
  );
}

// ---------- Question editor ----------
function QuestionEditor({ initial, catalog, onSaved, onClose }) {
  const [q, setQ] = useState(() => (initial ? { ...EMPTY_Q, ...initial, tags: (initial.tags || []).join(', ') } : EMPTY_Q));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setQ((x) => ({ ...x, ...patch }));
  const topics = catalog?.categories.flatMap((c) => c.topics.map((t) => ({ ...t, category: c.name }))) || [];
  const topicName = topics.find((t) => t.slug === q.topic)?.name;

  const setOption = (i, v) => set({ options: q.options.map((o, j) => (j === i ? v : o)) });
  const removeOption = (i) => set({ options: q.options.filter((_, j) => j !== i), answer: q.answer === i ? 0 : q.answer > i ? q.answer - 1 : q.answer });

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const body = { ...q, answer: Number(q.answer), estimatedSeconds: Number(q.estimatedSeconds), tags: q.tags };
      const r = initial?.id
        ? await apiRequest(`/aptitude/admin/questions/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/aptitude/admin/questions', { method: 'POST', body: JSON.stringify(body) });
      onSaved(r.question, Boolean(initial?.id));
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apt-modal" role="dialog" aria-modal="true" aria-labelledby="apt-qe-title">
      <div className="apt-modal-card apt-editor">
        <div className="apt-editor-head">
          <h2 id="apt-qe-title">{initial?.id ? `Edit ${initial.code}` : 'New question'}</h2>
          <button type="button" className="apt-icon-btn" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg" aria-hidden="true" /></button>
        </div>
        <div className="apt-editor-grid">
          <div className="apt-form">
            <div className="apt-form-row">
              <label>Topic
                <select value={q.topic} onChange={(e) => set({ topic: e.target.value })}>
                  <option value="">Choose…</option>
                  {catalog?.categories.map((c) => (
                    <optgroup key={c.slug} label={c.name}>{c.topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</optgroup>
                  ))}
                </select>
              </label>
              <label>Difficulty
                <select value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                  {Object.entries(DIFFICULTY).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                </select>
              </label>
            </div>
            <label>Question<textarea rows={4} value={q.statement} onChange={(e) => set({ statement: e.target.value })} maxLength={4000} /></label>
            <fieldset>
              <legend>Options <small>(pick the correct one)</small></legend>
              {q.options.map((o, i) => (
                <div key={i} className="apt-opt-row">
                  <input type="radio" name="apt-answer" checked={Number(q.answer) === i} onChange={() => set({ answer: i })} aria-label={`Option ${LETTERS[i]} is correct`} />
                  <span className="apt-letter">{LETTERS[i]}</span>
                  <input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={600} aria-label={`Option ${LETTERS[i]}`} />
                  {q.options.length > 2 && <button type="button" className="apt-icon-btn" onClick={() => removeOption(i)} aria-label={`Remove option ${LETTERS[i]}`}><i className="bi bi-trash" aria-hidden="true" /></button>}
                </div>
              ))}
              {q.options.length < 6 && <button type="button" className="apt-link" onClick={() => set({ options: [...q.options, ''] })}>+ Add option</button>}
            </fieldset>
            <label>Explanation<textarea rows={4} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} maxLength={6000} /></label>
            <label>Hint <small>(optional)</small><input value={q.hint} onChange={(e) => set({ hint: e.target.value })} maxLength={600} /></label>
            <label>Shortcut <small>(optional)</small><textarea rows={2} value={q.shortcut} onChange={(e) => set({ shortcut: e.target.value })} maxLength={1500} /></label>
            <div className="apt-form-row">
              <label>Code <small>(blank = automatic)</small><input value={q.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="QA-PCT-004" /></label>
              <label>Time (seconds)<input type="number" min={10} max={1800} value={q.estimatedSeconds} onChange={(e) => set({ estimatedSeconds: e.target.value })} /></label>
            </div>
            <div className="apt-form-row">
              <label>Tags <small>(comma separated)</small><input value={q.tags} onChange={(e) => set({ tags: e.target.value })} /></label>
              <label>Status
                <select value={q.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </label>
            </div>
            {catalog?.tracks?.length > 0 && (
              <fieldset>
                <legend>Placement tracks <small>(optional)</small></legend>
                <div className="apt-checks">
                  {catalog.tracks.map((t) => (
                    <label key={t.slug} className="apt-check">
                      <input type="checkbox" checked={q.tracks.includes(t.slug)} onChange={(e) => set({ tracks: e.target.checked ? [...q.tracks, t.slug] : q.tracks.filter((x) => x !== t.slug) })} /> {t.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <div>
            <h3 className="apt-editor-sub">Student preview</h3>
            <Preview q={q} topicName={topicName} />
          </div>
        </div>
        {errors.length > 0 && <p className="apt-error">{errors.join(' ')}</p>}
        <div className="apt-modal-actions">
          <button type="button" className="apt-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="apt-btn apt-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save question'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Overview ----------
function Overview({ stats }) {
  if (!stats) return <div className="apt-qcard apt-skeleton tall" />;
  return (
    <>
      <section className="apt-stats" aria-label="Question bank">
        <div className="apt-stat"><i className="bi bi-check2-circle" aria-hidden="true" /><div><strong>{stats.status.published}</strong><span>Published</span></div></div>
        <div className="apt-stat"><i className="bi bi-pencil" aria-hidden="true" /><div><strong>{stats.status.draft}</strong><span>Drafts</span></div></div>
        <div className="apt-stat"><i className="bi bi-archive" aria-hidden="true" /><div><strong>{stats.status.archived}</strong><span>Archived</span></div></div>
        <div className="apt-stat"><i className="bi bi-people" aria-hidden="true" /><div><strong>{stats.week.students}</strong><span>Students this week</span></div></div>
        <div className="apt-stat"><i className="bi bi-ui-checks" aria-hidden="true" /><div><strong>{stats.week.answers}</strong><span>Answers this week</span></div></div>
        <div className="apt-stat"><i className="bi bi-stopwatch" aria-hidden="true" /><div><strong>{stats.week.tests} / {stats.week.dailies}</strong><span>Tests / dailies this week</span></div></div>
      </section>
      <section className="apt-panel apt-section">
        <h2>Published questions by difficulty</h2>
        <div className="apt-table-wrap">
          <table className="apt-table">
            <thead><tr><th>Category</th>{Object.values(DIFFICULTY).map((d) => <th key={d.label}>{d.label}</th>)}<th>Topics with no questions</th></tr></thead>
            <tbody>
              {stats.categories.map((c) => (
                <tr key={c.slug}>
                  <td><b>{c.name}</b></td>
                  {Object.keys(DIFFICULTY).map((d) => <td key={d}>{c.byDifficulty[d]}</td>)}
                  <td className="apt-small-cell">{c.emptyTopics.length ? c.emptyTopics.map((t) => t.name).join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="apt-panel apt-section">
        <h2>Hardest questions</h2>
        <p className="apt-muted small">Lowest accuracy, with at least 5 answers. Very low numbers can mean a wrong answer key.</p>
        {stats.hardest.length === 0 ? <p className="apt-muted">Not enough answers yet.</p> : (
          <ul className="apt-topic-rank apt-gap">
            {stats.hardest.map((h) => (
              <li key={h.id}><div><strong>{h.code} · {h.topicName}</strong><span>{h.statement}</span></div><b className={`apt-acc ${h.accuracy < 40 ? 'low' : 'mid'}`}>{h.accuracy}% of {h.answers}</b></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------- Questions list ----------
function Questions({ catalog, onEdit, version, flash }) {
  const [filter, setFilter] = useState({ q: '', category: '', topic: '', difficulty: '', status: '', page: 1 });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== '' && v != null)).toString();
      apiRequest(`/aptitude/admin/questions?${qs}`).then((r) => !cancelled && setData(r)).catch((e) => !cancelled && flash(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filter, version, reload, flash]);

  const set = (patch) => {
    setFilter((f) => ({ ...f, page: 1, ...patch }));
    setSelected([]);
  };
  const topics = catalog?.categories.filter((c) => !filter.category || c.slug === filter.category).flatMap((c) => c.topics) || [];

  const bulk = async (status) => {
    const r = await apiRequest('/aptitude/admin/questions/status', { method: 'POST', body: JSON.stringify({ ids: selected, status }) }).catch((e) => flash(e.message));
    if (r) {
      flash(`${r.updated} question${r.updated === 1 ? '' : 's'} set to ${status}.`);
      setSelected([]);
      setReload((n) => n + 1);
    }
  };
  const remove = async (q) => {
    if (!window.confirm(`Delete ${q.code}? If students have answered it, it will be archived instead.`)) return;
    const r = await apiRequest(`/aptitude/admin/questions/${q.id}`, { method: 'DELETE' }).catch((e) => flash(e.message));
    if (r) {
      flash(r.message || `${q.code} deleted.`);
      setReload((n) => n + 1);
    }
  };
  const all = data?.questions.map((q) => q.id) || [];

  return (
    <>
      <div className="apt-admin-filters">
        <input type="search" placeholder="Search code, text or tag" value={filter.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search" />
        <select value={filter.category} onChange={(e) => set({ category: e.target.value, topic: '' })} aria-label="Category">
          <option value="">All categories</option>
          {catalog?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={filter.topic} onChange={(e) => set({ topic: e.target.value })} aria-label="Topic">
          <option value="">All topics</option>
          {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
        <select value={filter.difficulty} onChange={(e) => set({ difficulty: e.target.value })} aria-label="Difficulty">
          <option value="">Any difficulty</option>
          {Object.entries(DIFFICULTY).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="apt-notebook-bar">
        <span className="apt-muted small">{data ? `${data.total} question${data.total === 1 ? '' : 's'}` : 'Loading…'}</span>
        {selected.length > 0 && (
          <div className="apt-test-actions">
            <span className="apt-muted small">{selected.length} selected:</span>
            {STATUSES.map((s) => <button key={s} type="button" className="apt-btn" onClick={() => bulk(s)}>Set {s}</button>)}
          </div>
        )}
      </div>
      <div className="apt-table-wrap">
        <table className="apt-table apt-admin-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="Select all on this page" checked={all.length > 0 && selected.length === all.length} onChange={(e) => setSelected(e.target.checked ? all : [])} /></th>
              <th>Code</th><th>Question</th><th>Topic</th><th>Level</th><th>Status</th><th>Accuracy</th><th />
            </tr>
          </thead>
          <tbody>
            {data?.questions.map((q) => (
              <tr key={q.id}>
                <td><input type="checkbox" aria-label={`Select ${q.code}`} checked={selected.includes(q.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, q.id] : s.filter((x) => x !== q.id)))} /></td>
                <td><b>{q.code}</b></td>
                <td><div className="apt-q-cell">{q.statement}</div></td>
                <td>{q.topicName}</td>
                <td><span className={`apt-chip diff-${DIFFICULTY[q.difficulty]?.tone}`}>{DIFFICULTY[q.difficulty]?.label}</span></td>
                <td><span className={`apt-chip ${statusTone[q.status]}`}>{q.status}</span></td>
                <td>{q.accuracy == null ? '—' : `${q.accuracy}% (${q.answers})`}</td>
                <td className="apt-row-actions">
                  <button type="button" className="apt-icon-btn" onClick={() => onEdit(q)} aria-label={`Edit ${q.code}`}><i className="bi bi-pencil" aria-hidden="true" /></button>
                  <button type="button" className="apt-icon-btn" onClick={() => remove(q)} aria-label={`Delete ${q.code}`}><i className="bi bi-trash" aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
            {data?.questions.length === 0 && <tr><td colSpan={8} className="apt-muted">No questions match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data?.pages > 1 && (
        <div className="apt-topic-cta apt-gap">
          <button type="button" className="apt-btn" disabled={filter.page <= 1} onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
          <span className="apt-muted small">Page {data.page} of {data.pages}</span>
          <button type="button" className="apt-btn" disabled={filter.page >= data.pages} onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
        </div>
      )}
    </>
  );
}

// ---------- Bulk import ----------
function Import({ flash, onDone }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [opts, setOpts] = useState({ mode: 'skip', defaultStatus: 'draft' });
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState('all');

  const check = useCallback(async (list, options, dryRun = true) => {
    setBusy(true);
    setError('');
    try {
      const r = await apiRequest('/aptitude/admin/questions/import', { method: 'POST', body: JSON.stringify({ questions: list.rows, oneBasedNumbers: list.sheet, dryRun, ...options }) });
      setReport(r);
      if (!dryRun) {
        flash(`Imported: ${r.counts.new} new${r.counts.update ? `, ${r.counts.update} updated` : ''}.`);
        onDone();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [flash, onDone]);

  const pickFile = async (f) => {
    setReport(null);
    setRows(null);
    setError('');
    if (!f) return;
    setFile(f);
    try {
      let list;
      if (f.name.toLowerCase().endsWith('.json')) {
        if (f.size > MAX_FILE_BYTES) throw new Error('The file is larger than 5 MB.');
        const parsed = JSON.parse(await f.text());
        const arr = Array.isArray(parsed) ? parsed : parsed.questions;
        if (!Array.isArray(arr)) throw new Error('The JSON should be a list of questions, or { "questions": [...] }.');
        list = { rows: arr, sheet: false };
      } else {
        const sheets = await readSpreadsheet(f);
        list = { rows: rowsToObjects(sheets[0]?.rows || []), sheet: true };
      }
      if (!list.rows.length) throw new Error('No question rows found. The first row must be the column headers.');
      setRows(list);
      check(list, opts);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That JSON file has a syntax error.' : e.message);
    }
  };

  const changeOpt = (patch) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    if (rows) check(rows, next);
  };
  const visible = report?.rows.filter((r) => show === 'all' || r.action === show) || [];
  const saving = (report?.counts.new || 0) + (report?.counts.update || 0);

  return (
    <>
      <section className="apt-panel">
        <h2>Import questions</h2>
        <p className="apt-muted small">Upload an Excel (.xlsx), CSV or JSON file. Nothing is saved until you check the preview and press Import. Columns: <code>topic, difficulty, question, option_a … option_f, answer, explanation</code>, and optionally <code>code, hint, shortcut, tags, status, estimated_seconds</code>. The answer can be a letter (B) or a number (2 = second option). Topic can be its name or link name.</p>
        <div className="apt-topic-cta apt-gap">
          <label className="apt-btn apt-btn-primary apt-file">
            <i className="bi bi-upload" aria-hidden="true" /> Choose file
            <input type="file" accept=".xlsx,.csv,.json,text/csv,application/json" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="apt-btn" onClick={() => download('aptitude-questions-template.csv', TEMPLATE)}><i className="bi bi-download" aria-hidden="true" /> CSV template</button>
          {file && <span className="apt-muted small">{file.name}{rows ? ` · ${rows.rows.length} rows` : ''}</span>}
        </div>
        <div className="apt-form apt-form-row apt-gap">
          <label>If a code already exists
            <select value={opts.mode} onChange={(e) => changeOpt({ mode: e.target.value })}>
              <option value="skip">Skip that row</option>
              <option value="update">Overwrite the existing question</option>
            </select>
          </label>
          <label>Status when the file has none
            <select value={opts.defaultStatus} onChange={(e) => changeOpt({ defaultStatus: e.target.value })}>
              <option value="draft">Draft (review first)</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>
        {error && <p className="apt-error">{error}</p>}
      </section>

      {report && (
        <section className="apt-section">
          <div className="apt-notebook-bar">
            <div className="apt-filter-tabs" role="tablist" aria-label="Rows">
              {[['all', 'All', report.rows.length], ['new', 'New', report.counts.new], ['update', 'Update', report.counts.update], ['skip', 'Skip', report.counts.skip], ['error', 'Errors', report.counts.error]].map(([k, label, n]) => (
                <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? 'is-on' : ''} onClick={() => setShow(k)}>{label} ({n})</button>
              ))}
            </div>
            {report.dryRun ? (
              <button type="button" className="apt-btn apt-btn-primary" disabled={busy || !saving} onClick={() => check(rows, opts, false)}>
                {busy ? 'Working…' : `Import ${saving} question${saving === 1 ? '' : 's'}`}{report.counts.error ? ` (skip ${report.counts.error} with errors)` : ''}
              </button>
            ) : <span className="apt-ok"><i className="bi bi-check-circle-fill" aria-hidden="true" /> Saved</span>}
          </div>
          <div className="apt-table-wrap">
            <table className="apt-table apt-admin-table">
              <thead><tr><th>Row</th><th>Result</th><th>Code</th><th>Question</th><th>Topic</th><th>Answer</th><th>Problems</th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.row} className={r.action === 'error' ? 'is-error' : ''}>
                    <td>{r.row}</td>
                    <td><span className={`apt-chip ${r.action === 'error' ? 'diff-red' : r.action === 'new' ? 'solved' : r.action === 'update' ? 'diff-blue' : 'ghost'}`}>{r.action}</span></td>
                    <td>{r.code || '—'}</td>
                    <td><div className="apt-q-cell">{r.statement || '—'}</div></td>
                    <td>{r.topic || '—'}</td>
                    <td>{r.answer || '—'}</td>
                    <td className="apt-small-cell">{r.errors.length ? r.errors.join(' ') : r.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Test editor ----------
function TestEditor({ initial, catalog, onSaved, onClose }) {
  const [t, setT] = useState(() => (initial ? {
    ...EMPTY_T,
    ...initial,
    mode: initial.questionCodes?.length ? 'fixed' : 'sections',
    questionCodes: (initial.questionCodes || []).join(', '),
    sections: initial.sections?.length ? initial.sections : EMPTY_T.sections,
    opensAt: toLocalInput(initial.opensAt),
    closesAt: toLocalInput(initial.closesAt),
  } : EMPTY_T));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setT((x) => ({ ...x, ...patch }));
  const setSection = (i, patch) => set({ sections: t.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const count = t.mode === 'fixed' ? t.questionCodes.split(/[\s,]+/).filter(Boolean).length : t.sections.reduce((s, x) => s + (Number(x.count) || 0), 0);

  const save = async () => {
    setSaving(true);
    setError('');
    const body = {
      ...t,
      durationMinutes: Number(t.durationMinutes),
      marksPerQuestion: Number(t.marksPerQuestion),
      negativeMarks: Number(t.negativeMarks),
      maxAttempts: Number(t.maxAttempts),
      questionCodes: t.mode === 'fixed' ? t.questionCodes : '',
      sections: t.mode === 'fixed' ? [] : t.sections.map((s) => ({ ...s, count: Number(s.count) })),
      opensAt: t.opensAt ? new Date(t.opensAt).toISOString() : null,
      closesAt: t.closesAt ? new Date(t.closesAt).toISOString() : null,
    };
    try {
      const r = initial?.id
        ? await apiRequest(`/aptitude/admin/tests/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/aptitude/admin/tests', { method: 'POST', body: JSON.stringify(body) });
      onSaved(r.test);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apt-modal" role="dialog" aria-modal="true" aria-labelledby="apt-te-title">
      <div className="apt-modal-card apt-editor apt-editor-narrow">
        <div className="apt-editor-head">
          <h2 id="apt-te-title">{initial?.id ? 'Edit test' : 'New mock test'}</h2>
          <button type="button" className="apt-icon-btn" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg" aria-hidden="true" /></button>
        </div>
        <div className="apt-form">
          <label>Title<input value={t.title} onChange={(e) => set({ title: e.target.value })} maxLength={140} /></label>
          <label>Description<textarea rows={2} value={t.description} onChange={(e) => set({ description: e.target.value })} maxLength={3000} /></label>
          <div className="apt-form-row">
            <label>Type
              <select value={t.kind} onChange={(e) => set({ kind: e.target.value })}>
                {['topic', 'section', 'mixed', 'full', 'placement', 'custom'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label>Placement track
              <select value={t.track} onChange={(e) => set({ track: e.target.value })}>
                <option value="">None</option>
                {catalog?.tracks?.map((tr) => <option key={tr.slug} value={tr.slug}>{tr.name}</option>)}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Questions</legend>
            <div className="apt-filter-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={t.mode === 'sections'} className={t.mode === 'sections' ? 'is-on' : ''} onClick={() => set({ mode: 'sections' })}>Random from sections</button>
              <button type="button" role="tab" aria-selected={t.mode === 'fixed'} className={t.mode === 'fixed' ? 'is-on' : ''} onClick={() => set({ mode: 'fixed' })}>Fixed question list</button>
            </div>
            {t.mode === 'fixed' ? (
              <label className="apt-gap">Question codes <small>(comma or space separated)</small><textarea rows={3} value={t.questionCodes} onChange={(e) => set({ questionCodes: e.target.value.toUpperCase() })} placeholder="QA-PCT-001, QA-PL-002, LR-NS-001" /></label>
            ) : (
              <div className="apt-sections apt-gap">
                {t.sections.map((s, i) => (
                  <div key={i} className="apt-section-row">
                    <input value={s.name} onChange={(e) => setSection(i, { name: e.target.value })} placeholder="Section name" aria-label="Section name" />
                    <select value={s.category} onChange={(e) => setSection(i, { category: e.target.value })} aria-label="Category">
                      <option value="">Any category</option>
                      {catalog?.categories.map((c) => <option key={c.slug} value={c.slug}>{c.short}</option>)}
                    </select>
                    <select value={s.difficulty} onChange={(e) => setSection(i, { difficulty: e.target.value })} aria-label="Difficulty">
                      <option value="">Mixed</option>
                      {Object.entries(DIFFICULTY).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                    </select>
                    <input type="number" min={1} max={200} value={s.count} onChange={(e) => setSection(i, { count: e.target.value })} aria-label="Number of questions" />
                    <button type="button" className="apt-icon-btn" onClick={() => set({ sections: t.sections.filter((_, j) => j !== i) })} disabled={t.sections.length === 1} aria-label="Remove section"><i className="bi bi-trash" aria-hidden="true" /></button>
                  </div>
                ))}
                <button type="button" className="apt-link" onClick={() => set({ sections: [...t.sections, { name: '', category: '', count: 5, difficulty: '' }] })}>+ Add section</button>
              </div>
            )}
            <p className="apt-muted small">{count} question{count === 1 ? '' : 's'} per attempt.</p>
          </fieldset>
          <div className="apt-form-row apt-form-row-4">
            <label>Minutes<input type="number" min={1} max={360} value={t.durationMinutes} onChange={(e) => set({ durationMinutes: e.target.value })} /></label>
            <label>Marks each<input type="number" min={0} max={20} step="0.25" value={t.marksPerQuestion} onChange={(e) => set({ marksPerQuestion: e.target.value })} /></label>
            <label>Negative<input type="number" min={0} max={20} step="0.25" value={t.negativeMarks} onChange={(e) => set({ negativeMarks: e.target.value })} /></label>
            <label>Attempts <small>(0 = ∞)</small><input type="number" min={0} max={50} value={t.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} /></label>
          </div>
          <div className="apt-form-row">
            <label>Opens <small>(optional)</small><input type="datetime-local" value={t.opensAt} onChange={(e) => set({ opensAt: e.target.value })} /></label>
            <label>Closes <small>(optional)</small><input type="datetime-local" value={t.closesAt} onChange={(e) => set({ closesAt: e.target.value })} /></label>
          </div>
          <div className="apt-checks">
            <label className="apt-check"><input type="checkbox" checked={t.shuffleQuestions} onChange={(e) => set({ shuffleQuestions: e.target.checked })} /> Shuffle question order</label>
            <label className="apt-check"><input type="checkbox" checked={t.shuffleOptions} onChange={(e) => set({ shuffleOptions: e.target.checked })} /> Shuffle options for each student</label>
          </div>
          <label>Status
            <select value={t.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          {initial?.attempts > 0 && <p className="apt-muted small">Students who already started keep the questions and marking they began with.</p>}
        </div>
        {error && <p className="apt-error">{error}</p>}
        <div className="apt-modal-actions">
          <button type="button" className="apt-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="apt-btn apt-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save test'}</button>
        </div>
      </div>
    </div>
  );
}

function Tests({ catalog, flash }) {
  const [tests, setTests] = useState(null);
  const [editing, setEditing] = useState(null); // test, or {} for new
  const load = useCallback(() => apiRequest('/aptitude/admin/tests').then((r) => setTests(r.tests)).catch((e) => flash(e.message)), [flash]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}"? If students have taken it, it will be archived instead.`)) return;
    const r = await apiRequest(`/aptitude/admin/tests/${t.id}`, { method: 'DELETE' }).catch((e) => flash(e.message));
    if (r) {
      flash(r.message || 'Test deleted.');
      load();
    }
  };

  return (
    <>
      <div className="apt-notebook-bar">
        <span className="apt-muted small">{tests ? `${tests.length} test${tests.length === 1 ? '' : 's'}` : 'Loading…'}</span>
        <button type="button" className="apt-btn apt-btn-primary" onClick={() => setEditing({})}><i className="bi bi-plus-lg" aria-hidden="true" /> New test</button>
      </div>
      <div className="apt-table-wrap">
        <table className="apt-table apt-admin-table">
          <thead><tr><th>Test</th><th>Questions</th><th>Time</th><th>Marking</th><th>Status</th><th>Taken</th><th>Avg score</th><th /></tr></thead>
          <tbody>
            {tests?.map((t) => (
              <tr key={t.id}>
                <td><b>{t.title}</b><br /><small className="apt-muted">/{t.slug}</small></td>
                <td>{t.questionCodes.length ? `${t.questionCodes.length} fixed` : `${t.sections.reduce((s, x) => s + x.count, 0)} random`}</td>
                <td>{t.durationMinutes} min</td>
                <td>+{t.marksPerQuestion} / −{t.negativeMarks}</td>
                <td><span className={`apt-chip ${statusTone[t.status]}`}>{t.status}</span></td>
                <td>{t.attempts} ({t.students} students)</td>
                <td>{t.averagePercent == null ? '—' : `${t.averagePercent}%`}</td>
                <td className="apt-row-actions">
                  <button type="button" className="apt-icon-btn" onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`}><i className="bi bi-pencil" aria-hidden="true" /></button>
                  <button type="button" className="apt-icon-btn" onClick={() => remove(t)} aria-label={`Delete ${t.title}`}><i className="bi bi-trash" aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <TestEditor
          initial={editing.id ? editing : null}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            setEditing(null);
            flash(`Saved "${t.title}".`);
            load();
          }}
        />
      )}
    </>
  );
}

// ---------- Page ----------
export default function AdminAptitude() {
  const [tab, setTab] = useState('overview');
  const [catalog, setCatalog] = useState(null);
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(null);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState('');

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => {
    apiRequest('/aptitude/catalog').then(setCatalog).catch(() => {});
  }, []);
  useEffect(() => {
    apiRequest('/aptitude/admin/stats').then(setStats).catch((e) => flash(e.message));
  }, [version, flash]);

  const openEditor = async (q) => {
    if (!q) return setEditing({});
    // The list row has everything, but fetch fresh to edit the latest copy.
    const r = await apiRequest(`/aptitude/admin/questions/${q.id}`).catch((e) => flash(e.message));
    if (r) setEditing(r.question);
  };
  const bump = useMemo(() => () => setVersion((v) => v + 1), []);

  return (
    <>
      <Navbar />
      <main className="apt-page apt-admin">
        <div className="container apt-body">
          <div className="apt-admin-head">
            <div>
              <h1>Aptitude</h1>
              <p className="apt-muted">Question bank, bulk import, mock tests and usage.</p>
            </div>
            <div className="apt-test-actions">
              <Link to="/aptitude" className="apt-btn"><i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Student view</Link>
              <button type="button" className="apt-btn apt-btn-primary" onClick={() => openEditor(null)}><i className="bi bi-plus-lg" aria-hidden="true" /> New question</button>
            </div>
          </div>
          <div className="apt-filter-tabs apt-admin-tabs" role="tablist" aria-label="Sections">
            {TABS.map(([key, label, icon]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}><i className={`bi ${icon}`} aria-hidden="true" /> {label}</button>
            ))}
          </div>
          <div className="apt-section">
            {tab === 'overview' && <Overview stats={stats} />}
            {tab === 'questions' && <Questions catalog={catalog} onEdit={openEditor} version={version} flash={flash} />}
            {tab === 'import' && <Import flash={flash} onDone={bump} />}
            {tab === 'tests' && <Tests catalog={catalog} flash={flash} />}
          </div>
        </div>
        {editing && (
          <QuestionEditor
            initial={editing.id ? editing : null}
            catalog={catalog}
            onClose={() => setEditing(null)}
            onSaved={(q, updated) => {
              setEditing(null);
              flash(`${updated ? 'Updated' : 'Created'} ${q.code}${q.status !== 'published' ? ` (${q.status})` : ''}.`);
              bump();
            }}
          />
        )}
        {toast && <div className="apt-toast" role="status">{toast}</div>}
      </main>
    </>
  );
}
