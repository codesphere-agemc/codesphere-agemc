import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ExcelImport from '../components/ExcelImport';
import RichTextEditor from '../components/RichTextEditor';
import { apiRequest } from '../lib/api';
import {
  CATEGORIES, CATEGORY, SCHEME_TEMPLATES, STATUSES, VISIBILITY,
  fmt, formatDay, maxTotalOf, newKey, ordinal, parsePastedRows, previewStandings, toDateInput,
} from '../lib/results';
import '../css/Results.css';

const fromTemplate = (category) => (SCHEME_TEMPLATES[category] || SCHEME_TEMPLATES.other).map((c) => ({ ...c, key: newKey() }));

const blankEntry = () => ({ key: newKey(), name: '', subtitle: '', members: [], users: [], identities: [], scores: {}, adjustment: '', status: '', award: '', remarks: '' });

const toEditorEntry = (e) => ({
  key: e.id || newKey(),
  id: e.id,
  name: e.name || '',
  subtitle: e.subtitle || '',
  members: e.members || [],
  users: e.users || [],
  identities: e.identities || [],
  scores: Object.fromEntries(Object.entries(e.scores || {}).map(([k, v]) => [k, String(v)])),
  adjustment: e.adjustment ? String(e.adjustment) : '',
  status: e.status || '',
  award: e.award || '',
  remarks: e.remarks || '',
});

// Organisers: build the marking scheme, enter marks, publish.
export default function ResultEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(Boolean(id));
  const [form, setForm] = useState({
    title: '', category: 'hackathon', organization: 'CodeSphere', heldOn: '', summary: '', notes: '',
    visibility: 'full', passPercent: '', source: null, status: 'draft', slug: '',
  });
  const [criteria, setCriteria] = useState(() => fromTemplate('hackathon'));
  const [schemeTouched, setSchemeTouched] = useState(false);
  const [entries, setEntries] = useState(() => [blankEntry()]);
  const [expanded, setExpanded] = useState(null);
  const [sources, setSources] = useState(null);
  const [importOpen, setImportOpen] = useState(Boolean(location.state?.openImport));
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [sortByRank, setSortByRank] = useState(false);
  // Banner: the saved image, or (for a new result) a picked file uploaded on first save.
  const [banner, setBanner] = useState('');
  const [pendingBanner, setPendingBanner] = useState(null);
  const [bannerBusy, setBannerBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiRequest(`/results/admin/${id}`)
      .then(({ result: r }) => {
        setBanner(r.banner || '');
        setForm({
          title: r.title, category: r.category, organization: r.organization, heldOn: toDateInput(r.heldOn),
          summary: r.summary || '', notes: r.notes || '', visibility: r.visibility,
          passPercent: r.passPercent ?? '', source: r.source, status: r.status, slug: r.slug,
        });
        setCriteria(r.criteria.map((c) => ({ ...c })));
        setSchemeTouched(true);
        setEntries(r.entries.length ? r.entries.map(toEditorEntry) : [blankEntry()]);
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!importOpen || sources) return;
    apiRequest('/results/admin/sources').then(setSources).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, [importOpen, sources]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const cat = CATEGORY[form.category] || CATEGORY.other;
  const maxTotal = maxTotalOf(criteria);
  const standings = useMemo(() => previewStandings(criteria, entries), [criteria, entries]);
  const rankByKey = new Map(standings.map((s) => [s.key, s]));
  const orderedEntries = sortByRank
    ? [...entries].sort((a, b) => (rankByKey.get(a.key)?.rank ?? 1e9) - (rankByKey.get(b.key)?.rank ?? 1e9))
    : entries;

  const changeCategory = (e) => {
    const category = e.target.value;
    setForm((f) => ({ ...f, category }));
    // Swap in the matching template until the organiser edits the scheme.
    if (!schemeTouched) setCriteria(fromTemplate(category));
  };

  // ---- Marking scheme ----
  const editCriterion = (key, field, value) => {
    setSchemeTouched(true);
    setCriteria((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };
  const moveCriterion = (index, dir) => {
    setSchemeTouched(true);
    setCriteria((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      return next;
    });
  };
  const removeCriterion = (key) => {
    setSchemeTouched(true);
    setCriteria((list) => list.filter((c) => c.key !== key));
  };
  const addCriterion = () => {
    setSchemeTouched(true);
    setCriteria((list) => [...list, { key: newKey(), name: '', description: '', maxMarks: 10 }]);
  };
  const applyTemplate = () => {
    const hasMarks = entries.some((e) => Object.keys(e.scores).length);
    if (hasMarks && !window.confirm('Replace the marking scheme with the template? Marks already entered for the current criteria will be cleared.')) return;
    setCriteria(fromTemplate(form.category));
    setEntries((list) => list.map((e) => ({ ...e, scores: {} })));
    setSchemeTouched(false);
  };

  // ---- Entries ----
  const editEntry = (key, field, value) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, [field]: value } : e)));
  const editScore = (key, cKey, value) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, scores: { ...e.scores, [cKey]: value } } : e)));
  const removeEntry = (key) => setEntries((list) => (list.length > 1 ? list.filter((e) => e.key !== key) : [blankEntry()]));
  const addEntry = () => setEntries((list) => [...list, blankEntry()]);

  const keepFilled = (list) => list.filter((e) => e.name.trim());

  const importFrom = async (kind, sourceId) => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const data = await apiRequest(`/results/admin/import/${kind}/${sourceId}`);
      let nextCriteria = criteria;
      const withJudge = data.entries.some((e) => typeof e.judgeScore === 'number');
      let judgeKey = null;
      if (withJudge && window.confirm('These submissions already have a judging score (out of 100). Add it to the marking scheme as "Judges\' score"?')) {
        judgeKey = newKey();
        nextCriteria = [...criteria, { key: judgeKey, name: 'Judges\' score', description: 'Overall score from the hackathon judging panel.', maxMarks: 100 }];
        setCriteria(nextCriteria);
        setSchemeTouched(true);
      }
      const imported = data.entries.map((e) => ({
        ...blankEntry(),
        name: e.name,
        subtitle: e.subtitle || '',
        members: e.members || [],
        users: e.users || [],
        status: e.status || '',
        award: e.award || '',
        remarks: e.remarks || '',
        scores: judgeKey && typeof e.judgeScore === 'number' ? { [judgeKey]: String(e.judgeScore) } : {},
      }));
      setEntries((list) => [...keepFilled(list), ...imported]);
      setForm((f) => ({
        ...f,
        source: data.source,
        title: f.title || data.title,
        organization: data.organization || f.organization,
        heldOn: f.heldOn || toDateInput(data.heldOn),
        category: kind === 'hackathon' ? 'hackathon' : f.category === 'hackathon' ? 'interview' : f.category,
      }));
      if (kind === 'recruitment' && !schemeTouched && form.category !== 'interview') setCriteria(fromTemplate('interview'));
      setImportOpen(false);
      setMsg({ type: 'ok', text: `Imported ${imported.length} ${imported.length === 1 ? 'entry' : 'entries'}. Each one is linked to their CodeSphere account.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  // Rows read from an uploaded Excel / CSV sheet.
  const importSheet = ({ entries: rows, newCriteria, mode, replaceScheme, fileName, overMax }) => {
    if (replaceScheme) {
      setCriteria(newCriteria);
    } else if (newCriteria.length) {
      setCriteria((list) => [...list, ...newCriteria]);
    }
    if (replaceScheme || newCriteria.length) setSchemeTouched(true);
    setEntries((list) => {
      const kept = mode === 'replace' ? [] : keepFilled(list);
      // Old marks belong to criteria that no longer exist once the scheme is replaced.
      return [...(replaceScheme ? kept.map((e) => ({ ...e, scores: {} })) : kept), ...rows];
    });
    const base = fileName.replace(/\.(xlsx|csv)$/i, '').replace(/[_-]+/g, ' ').trim();
    setForm((f) => ({ ...f, title: f.title || base.slice(0, 120) }));
    setSortByRank(true);
    setImportOpen(false);
    setMsg({
      type: overMax ? 'error' : 'ok',
      text: `Imported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} from ${fileName}.${overMax ? ` ${overMax} mark${overMax === 1 ? ' is' : 's are'} above the maximum (in red): fix them before saving.` : ' Check the marks below, then save or publish.'}`,
    });
  };

  const importPasted = () => {
    const rows = parsePastedRows(pasteText, criteria);
    if (!rows.length) {
      setMsg({ type: 'error', text: 'Nothing to import. Put one participant per line: Name, email or username, then the marks in scheme order.' });
      return;
    }
    setEntries((list) => [...keepFilled(list), ...rows]);
    setPasteText('');
    setImportOpen(false);
    setMsg({ type: 'ok', text: `Added ${rows.length} row${rows.length === 1 ? '' : 's'} from the pasted list.` });
  };

  // ---- Banner ----
  const uploadBanner = async (resultId, file) => {
    const body = new FormData();
    body.append('banner', file, file.name);
    const r = await apiRequest(`/results/admin/${resultId}/banner`, { method: 'PUT', body });
    setBanner(r.banner);
    setPendingBanner(null);
  };

  const pickBanner = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'The banner must be 5 MB or smaller.' });
      return;
    }
    if (!id) {
      // Not saved yet: preview now, upload on first save.
      setPendingBanner(file);
      setBanner(URL.createObjectURL(file));
      return;
    }
    setBannerBusy(true);
    try {
      await uploadBanner(id, file);
      setMsg({ type: 'ok', text: 'Banner updated.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBannerBusy(false);
    }
  };

  const removeBanner = async () => {
    if (!id) {
      setPendingBanner(null);
      setBanner('');
      return;
    }
    setBannerBusy(true);
    try {
      await apiRequest(`/results/admin/${id}/banner`, { method: 'DELETE' });
      setBanner('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBannerBusy(false);
    }
  };

  // ---- Save ----
  const save = async (publish) => {
    setBusy(true);
    setMsg({ type: '', text: '' });
    const payload = {
      ...form,
      passPercent: form.passPercent === '' ? null : Number(form.passPercent),
      criteria: criteria.map((c) => ({ ...c, maxMarks: Number(c.maxMarks) })),
      entries: keepFilled(entries).map((e) => ({
        id: e.id,
        name: e.name,
        subtitle: e.subtitle,
        members: e.members,
        users: e.users,
        identities: e.identities,
        scores: Object.fromEntries(Object.entries(e.scores).filter(([, v]) => v !== '' && v !== undefined)),
        adjustment: e.adjustment,
        status: e.status,
        award: e.award,
        remarks: e.remarks,
      })),
    };
    try {
      const saved = await apiRequest(id ? `/results/admin/${id}` : '/results/admin', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      // A banner picked before the first save goes up now.
      if (pendingBanner) await uploadBanner(saved.id, pendingBanner);
      if (publish !== undefined) {
        await apiRequest(`/results/admin/${saved.id}/publish`, { method: 'POST', body: JSON.stringify({ publish, notify: publish }) });
      }
      const unlinked = saved.unlinked?.length ? ` No account found for: ${saved.unlinked.slice(0, 5).join(', ')}${saved.unlinked.length > 5 ? '…' : ''}.` : '';
      if (publish) {
        navigate(`/results/${saved.slug}`);
        return;
      }
      if (!id) {
        navigate(`/admin/results/${saved.id}/edit`, { replace: true });
      } else {
        // Reload to pick up linked accounts and server-side ranks.
        const { result: r } = await apiRequest(`/results/admin/${id}`);
        setEntries(r.entries.length ? r.entries.map(toEditorEntry) : [blankEntry()]);
        setForm((f) => ({ ...f, status: r.status, slug: r.slug }));
      }
      setMsg({ type: 'ok', text: `Saved.${publish === false ? ' The result is now a draft.' : ''}${unlinked}` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="res-page res-admin"><div className="container res-body"><p className="res-muted">Loading…</p></div></main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="res-page res-admin res-editor">
        <div className="container res-body">
          <div className="res-admin-head">
            <div>
              <Link to="/admin/results" className="res-back dark"><i className="bi bi-arrow-left" aria-hidden="true" /> All results</Link>
              <h1>{id ? 'Edit result' : 'New result'}</h1>
              <p className="res-muted">Set up a marking scheme, enter the marks, and publish. Totals, percentages and ranks are calculated for you.</p>
            </div>
            <div className="res-actions">
              {form.slug && <Link to={`/results/${form.slug}`} className="res-btn">Preview</Link>}
              <button type="button" className="res-btn" onClick={() => setImportOpen((o) => !o)} aria-expanded={importOpen}>
                <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Import (Excel, CSV…)
              </button>
            </div>
          </div>

          {msg.text && <p className={msg.type === 'error' ? 'res-error' : 'res-ok'} role="status">{msg.text}</p>}

          {importOpen && (
            <section className="res-panel res-import">
              <h2><i className="bi bi-box-arrow-in-down" aria-hidden="true" /> Import participants</h2>
              <ExcelImport criteria={criteria} noun={cat.noun} hasEntries={keepFilled(entries).length > 0} onImport={importSheet} />
              <div className="res-import-or"><span>or import from CodeSphere</span></div>
              <div className="res-import-grid">
                <label>
                  <span>From a CodeSphere hackathon</span>
                  <select defaultValue="" disabled={busy || !sources} onChange={(e) => importFrom('hackathon', e.target.value)}>
                    <option value="">{sources ? (sources.hackathons.length ? 'Choose a hackathon…' : 'No hackathons yet') : 'Loading…'}</option>
                    {sources?.hackathons.map((h) => <option key={h.id} value={h.id}>{h.title} ({formatDay(h.date)})</option>)}
                  </select>
                  <small>Adds every team with its members, project, award and judging score.</small>
                </label>
                <label>
                  <span>From a recruitment or interview</span>
                  <select defaultValue="" disabled={busy || !sources} onChange={(e) => importFrom('recruitment', e.target.value)}>
                    <option value="">{sources ? (sources.recruitments.length ? 'Choose a recruitment…' : 'No recruitments yet') : 'Loading…'}</option>
                    {sources?.recruitments.map((r) => <option key={r.id} value={r.id}>{r.organization}: {r.title}</option>)}
                  </select>
                  <small>Adds every applicant with the role they applied for and their status.</small>
                </label>
                <label className="wide">
                  <span>Paste a list (from Excel or Google Sheets)</span>
                  <textarea
                    rows={4}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Name, email or username, ${criteria.map((c) => c.name || 'marks').join(', ')}\nAarav Sharma, aarav@example.com, ${criteria.map((c) => Math.round((Number(c.maxMarks) || 10) * 0.8)).join(', ')}`}
                  />
                  <small>One per line. Marks follow the order of the marking scheme. The email or username is optional; when it's there, the result shows up in that member's dashboard.</small>
                </label>
              </div>
              <div className="res-actions">
                <button type="button" className="res-btn res-btn-primary" onClick={importPasted} disabled={!pasteText.trim()}>Add pasted rows</button>
                <button type="button" className="res-btn" onClick={() => setImportOpen(false)}>Close</button>
              </div>
            </section>
          )}

          <section className="res-panel">
            <h2><span className="res-step">1</span> Details</h2>
            <div className="res-form-grid">
              <label className="wide"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={120} placeholder="CodeSphere Hack 2026: Final results" /></label>
              <label>
                <span>Type of result</span>
                <select value={form.category} onChange={changeCategory}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label><span>Organised by</span><input value={form.organization} onChange={set('organization')} maxLength={100} /></label>
              <label><span>Held on</span><input type="date" value={form.heldOn} onChange={set('heldOn')} /></label>
              <div className="wide res-rich-field">
                <span className="res-field-label">Summary <small>(optional)</small></span>
                <RichTextEditor
                  value={form.summary}
                  onChange={(content) => setForm((f) => ({ ...f, summary: content }))}
                  height={240}
                  placeholder="Final round judged by a panel of 4 industry mentors…"
                />
              </div>
              <div className="wide res-rich-field">
                <span className="res-field-label">Notes for participants <small>(optional)</small></span>
                <RichTextEditor
                  value={form.notes}
                  onChange={(content) => setForm((f) => ({ ...f, notes: content }))}
                  height={300}
                  placeholder="How judging worked, tie-breaks, next steps for selected candidates…"
                />
              </div>
            </div>
          </section>

          <section className="res-panel">
            <h2><i className="bi bi-image" aria-hidden="true" /> Banner <small className="res-muted">(optional)</small></h2>
            <p className="res-muted">Shown at the top of the results page, on its card, in emails and in Recent updates on the home page. JPG, PNG or WebP, up to 5 MB. A wide image (about 1600 × 600) works best.</p>
            <label className={`res-banner-pick ${banner ? 'has-image' : ''}`}>
              {banner
                ? <img src={banner} alt="Results banner preview" />
                : <span><i className={`bi ${bannerBusy ? 'bi-arrow-repeat' : 'bi-cloud-arrow-up'}`} aria-hidden="true" /> {bannerBusy ? 'Uploading…' : 'Click to upload a banner'}</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickBanner} disabled={bannerBusy} hidden />
            </label>
            {banner && (
              <div className="res-banner-actions">
                <label className="res-btn">
                  <i className="bi bi-arrow-repeat" aria-hidden="true" /> {bannerBusy ? 'Uploading…' : 'Replace'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickBanner} disabled={bannerBusy} hidden />
                </label>
                <button type="button" className="res-btn" onClick={removeBanner} disabled={bannerBusy}><i className="bi bi-trash3" aria-hidden="true" /> Remove</button>
                {pendingBanner && <span className="res-muted">Uploads when you save.</span>}
              </div>
            )}
          </section>

          <section className="res-panel">
            <div className="res-panel-head">
              <h2><span className="res-step">2</span> Marking scheme</h2>
              <button type="button" className="res-link" onClick={applyTemplate}><i className="bi bi-magic" aria-hidden="true" /> Use the {cat.label.toLowerCase()} template</button>
            </div>
            <div className="res-criteria">
              <div className="res-criteria-head" aria-hidden="true"><span>Criterion</span><span>What it measures</span><span>Max marks</span><span /></div>
              {criteria.map((c, i) => (
                <div key={c.key} className="res-criterion">
                  <input value={c.name} onChange={(e) => editCriterion(c.key, 'name', e.target.value)} maxLength={60} placeholder="e.g. Problem solving" aria-label={`Criterion ${i + 1} name`} />
                  <input value={c.description} onChange={(e) => editCriterion(c.key, 'description', e.target.value)} maxLength={240} placeholder="Optional description" aria-label={`Criterion ${i + 1} description`} />
                  <input type="number" min="1" max="1000" step="0.5" value={c.maxMarks} onChange={(e) => editCriterion(c.key, 'maxMarks', e.target.value)} aria-label={`Criterion ${i + 1} maximum marks`} />
                  <div className="res-criterion-tools">
                    <button type="button" className="res-icon-btn" disabled={i === 0} onClick={() => moveCriterion(i, -1)} aria-label="Move up"><i className="bi bi-arrow-up" /></button>
                    <button type="button" className="res-icon-btn" disabled={i === criteria.length - 1} onClick={() => moveCriterion(i, 1)} aria-label="Move down"><i className="bi bi-arrow-down" /></button>
                    <button type="button" className="res-icon-btn danger" onClick={() => removeCriterion(c.key)} aria-label={`Remove ${c.name || 'criterion'}`}><i className="bi bi-x-lg" /></button>
                  </div>
                </div>
              ))}
              <div className="res-criteria-foot">
                <button type="button" className="res-btn" onClick={addCriterion} disabled={criteria.length >= 12}><i className="bi bi-plus-lg" aria-hidden="true" /> Add criterion</button>
                <strong>Total: {fmt(maxTotal)} marks</strong>
              </div>
              {maxTotal > 0 && (
                <div className="res-scheme-split" aria-label="Share of total marks">
                  {criteria.map((c, i) => (
                    <i key={c.key} className={`seg-${i % 6}`} style={{ flexGrow: Number(c.maxMarks) || 0 }} title={`${c.name}: ${Math.round(((Number(c.maxMarks) || 0) / maxTotal) * 100)}%`} />
                  ))}
                </div>
              )}
            </div>

            <div className="res-form-grid">
              <label>
                <span>Qualifying score <small>(optional, %)</small></span>
                <input type="number" min="0" max="100" value={form.passPercent} onChange={set('passPercent')} placeholder="e.g. 60" />
              </label>
              <fieldset className="wide res-visibility">
                <legend>Who sees the marks</legend>
                {VISIBILITY.map((v) => (
                  <label key={v.id} className={form.visibility === v.id ? 'on' : ''}>
                    <input type="radio" name="visibility" value={v.id} checked={form.visibility === v.id} onChange={set('visibility')} />
                    <span><strong>{v.label}</strong><small>{v.hint}</small></span>
                  </label>
                ))}
              </fieldset>
            </div>
          </section>

          <section className="res-panel">
            <div className="res-panel-head">
              <h2><span className="res-step">3</span> {cat.noun}s &amp; marks <small className="res-muted">({keepFilled(entries).length})</small></h2>
              <label className="res-check"><input type="checkbox" checked={sortByRank} onChange={(e) => setSortByRank(e.target.checked)} /> Sort by rank</label>
            </div>
            <div className="res-table-wrap">
              <table className="res-table res-grid-edit">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">{cat.noun}</th>
                    {criteria.map((c) => <th key={c.key} scope="col" className="num">{c.name || '—'}<small>/{fmt(Number(c.maxMarks) || 0)}</small></th>)}
                    <th scope="col" className="num" title="Bonus (+) or penalty (−)">+/−</th>
                    <th scope="col" className="num">Total</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {orderedEntries.map((e) => {
                    const live = rankByKey.get(e.key);
                    const linked = e.users.length > 0;
                    return [
                      <tr key={e.key}>
                        <td><span className="res-rank">{e.name ? ordinal(live?.rank) : ''}</span></td>
                        <td className="res-name-edit">
                          <input value={e.name} onChange={(ev) => editEntry(e.key, 'name', ev.target.value)} maxLength={100} placeholder={`${cat.noun} name`} aria-label={`${cat.noun} name`} />
                          <span className={`res-link-state ${linked ? 'on' : ''}`} title={linked ? 'Linked to a CodeSphere account' : 'Not linked: add an email or username in details'}>
                            <i className={`bi ${linked ? 'bi-person-check-fill' : 'bi-person-dash'}`} aria-hidden="true" />
                          </span>
                        </td>
                        {criteria.map((c) => {
                          const v = e.scores[c.key] ?? '';
                          const over = v !== '' && (Number(v) > Number(c.maxMarks) || Number(v) < 0);
                          return (
                            <td key={c.key} className="num">
                              <input
                                type="number"
                                min="0"
                                max={c.maxMarks}
                                step="0.5"
                                className={over ? 'invalid' : ''}
                                value={v}
                                onChange={(ev) => editScore(e.key, c.key, ev.target.value)}
                                aria-label={`${e.name || cat.noun}: ${c.name}`}
                              />
                            </td>
                          );
                        })}
                        <td className="num"><input type="number" step="0.5" value={e.adjustment} onChange={(ev) => editEntry(e.key, 'adjustment', ev.target.value)} aria-label={`${e.name || cat.noun}: bonus or penalty`} /></td>
                        <td className="num"><strong>{fmt(live?.total || 0)}</strong><small className="res-muted"> {fmt(live?.percent || 0)}%</small></td>
                        <td>
                          <select value={e.status} onChange={(ev) => editEntry(e.key, 'status', ev.target.value)} aria-label={`${e.name || cat.noun}: status`}>
                            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        </td>
                        <td className="res-row-tools">
                          <button type="button" className={`res-icon-btn ${expanded === e.key ? 'on' : ''}`} onClick={() => setExpanded(expanded === e.key ? null : e.key)} aria-expanded={expanded === e.key} aria-label="More details"><i className="bi bi-three-dots" /></button>
                          <button type="button" className="res-icon-btn danger" onClick={() => removeEntry(e.key)} aria-label={`Remove ${e.name || 'row'}`}><i className="bi bi-trash" /></button>
                        </td>
                      </tr>,
                      expanded === e.key && (
                        <tr key={`${e.key}-more`} className="res-row-more">
                          <td colSpan={99}>
                            <div className="res-form-grid compact">
                              <label><span>{form.category === 'interview' ? 'Role' : form.category === 'hackathon' ? 'Project' : 'Subtitle'}</span><input value={e.subtitle} onChange={(ev) => editEntry(e.key, 'subtitle', ev.target.value)} maxLength={120} /></label>
                              <label><span>Award / title</span><input value={e.award} onChange={(ev) => editEntry(e.key, 'award', ev.target.value)} maxLength={80} placeholder="Best UI, Track winner…" /></label>
                              <label><span>Team members <small>(comma separated)</small></span><input value={e.members.join(', ')} onChange={(ev) => editEntry(e.key, 'members', ev.target.value.split(',').map((m) => m.trimStart()))} /></label>
                              <label>
                                <span>Link accounts <small>(emails or usernames)</small></span>
                                <input value={e.identities.join(', ')} onChange={(ev) => editEntry(e.key, 'identities', ev.target.value.split(',').map((m) => m.trim()).filter(Boolean))} placeholder="name@college.edu, @username" />
                                <small>{linked ? `${e.users.length} account${e.users.length === 1 ? '' : 's'} linked.` : 'Linked members see this in their dashboard.'}</small>
                              </label>
                              <label className="wide"><span>Remarks / feedback</span><textarea rows={2} value={e.remarks} onChange={(ev) => editEntry(e.key, 'remarks', ev.target.value)} maxLength={600} /></label>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="res-btn" onClick={addEntry}><i className="bi bi-plus-lg" aria-hidden="true" /> Add {cat.noun.toLowerCase()}</button>
          </section>

          <div className="res-savebar">
            <span className="res-muted small">
              {form.status === 'published' ? <><i className="bi bi-broadcast" aria-hidden="true" /> Published. Saving updates it live.</> : <><i className="bi bi-pencil-square" aria-hidden="true" /> Draft: only organisers can see it.</>}
            </span>
            <div className="res-actions">
              {form.status === 'published' && <button type="button" className="res-btn" disabled={busy} onClick={() => save(false)}>Unpublish</button>}
              <button type="button" className="res-btn" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
              {form.status !== 'published' && <button type="button" className="res-btn res-btn-primary" disabled={busy} onClick={() => save(true)}><i className="bi bi-send" aria-hidden="true" /> Save &amp; publish</button>}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
