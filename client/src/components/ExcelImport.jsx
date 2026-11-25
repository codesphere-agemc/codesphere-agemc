import { useMemo, useRef, useState } from 'react';
import {
  FIELD_OPTIONS, buildImport, findHeaderRow, guessMapping, readSpreadsheet, templateCsv,
} from '../lib/spreadsheet';
import { fmt } from '../lib/results';

const cellText = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toLocaleDateString('en-IN') : String(v));

// Upload an Excel/CSV sheet, check how its columns map onto the result, import.
export default function ExcelImport({ criteria, noun, hasEntries, onImport }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState([]);
  const [mode, setMode] = useState('add');
  const [replaceScheme, setReplaceScheme] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const rows = useMemo(() => sheets[sheetIndex]?.rows || [], [sheets, sheetIndex]);
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, c) => cellText(rows[headerRow]?.[c]).trim() || `Column ${c + 1}`);
  const dataRows = useMemo(
    () => rows.slice(headerRow + 1).filter((r) => r.some((v) => cellText(v).trim())),
    [rows, headerRow],
  );

  const remap = (nextRows, nextHeader) => {
    const w = Math.max(0, ...nextRows.slice(0, 200).map((r) => r.length));
    const hs = Array.from({ length: w }, (_, c) => cellText(nextRows[nextHeader]?.[c]).trim());
    const body = nextRows.slice(nextHeader + 1).filter((r) => r.some((v) => cellText(v).trim()));
    const guess = guessMapping(hs, body, criteria);
    setMapping(guess);
    // The sheet has its own mark columns and none match the scheme: offer to use them instead.
    setReplaceScheme(!guess.some((m) => m.startsWith('crit:')) && guess.includes('new'));
  };

  const load = async (picked) => {
    if (!picked) return;
    setError('');
    setReading(true);
    try {
      const read = (await readSpreadsheet(picked)).filter((s) => s.rows.length);
      if (!read.length) throw new Error('That file is empty.');
      setFile(picked);
      setSheets(read);
      setSheetIndex(0);
      const h = findHeaderRow(read[0].rows);
      setHeaderRow(h);
      remap(read[0].rows, h);
    } catch (e) {
      setError(e.message);
      setFile(null);
      setSheets([]);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const pickSheet = (i) => {
    setSheetIndex(i);
    const h = findHeaderRow(sheets[i].rows);
    setHeaderRow(h);
    remap(sheets[i].rows, h);
  };

  const pickHeader = (h) => {
    setHeaderRow(h);
    remap(rows, h);
  };

  const preview = mapping.length ? buildImport({ headers, dataRows, mapping, criteria, replaceScheme }) : null;

  const reset = () => {
    setFile(null);
    setSheets([]);
    setMapping([]);
    setError('');
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv(criteria, noun)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'result-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasName = mapping.includes('name');
  const critOptions = replaceScheme ? [] : criteria.map((c) => ({ id: `crit:${c.key}`, label: `Marks: ${c.name || 'criterion'} (/${fmt(Number(c.maxMarks) || 0)})` }));

  const submit = () => {
    if (!preview?.entries.length) return;
    onImport({ ...preview, mode, replaceScheme, fileName: file?.name || '' });
    reset();
  };

  if (!file) {
    return (
      <div className="res-xl">
        <div
          className={`res-drop ${dragging ? 'on' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files?.[0]); }}
        >
          <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" />
          <div>
            <strong>{reading ? 'Reading the sheet…' : 'Upload an Excel or CSV sheet'}</strong>
            <p>Drag a <b>.xlsx</b> or <b>.csv</b> file here. One row per {noun.toLowerCase()}: a name column plus their marks. Max 5 MB.</p>
          </div>
          <div className="res-actions">
            <button type="button" className="res-btn res-btn-primary" disabled={reading} onClick={() => inputRef.current?.click()}>
              <i className="bi bi-upload" aria-hidden="true" /> Choose file
            </button>
            <button type="button" className="res-btn" onClick={downloadTemplate}>
              <i className="bi bi-download" aria-hidden="true" /> Template
            </button>
          </div>
          <input ref={inputRef} type="file" hidden accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => load(e.target.files?.[0])} />
        </div>
        {error && <p className="res-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="res-xl">
      <div className="res-xl-file">
        <i className="bi bi-file-earmark-spreadsheet-fill" aria-hidden="true" />
        <div>
          <strong>{file.name}</strong>
          <small>{dataRows.length} row{dataRows.length === 1 ? '' : 's'} · {width} column{width === 1 ? '' : 's'}</small>
        </div>
        <button type="button" className="res-link" onClick={reset}>Choose another file</button>
      </div>

      <div className="res-form-grid res-xl-opts">
        {sheets.length > 1 && (
          <label>
            <span>Sheet</span>
            <select value={sheetIndex} onChange={(e) => pickSheet(Number(e.target.value))}>
              {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>Column titles are in row</span>
          <select value={headerRow} onChange={(e) => pickHeader(Number(e.target.value))}>
            {rows.slice(0, 15).map((r, i) => (
              <option key={i} value={i}>Row {i + 1}: {r.map(cellText).filter(Boolean).slice(0, 3).join(', ').slice(0, 40)}</option>
            ))}
          </select>
        </label>
        {hasEntries && (
          <label>
            <span>Existing {noun.toLowerCase()}s</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="add">Keep them, add these rows</option>
              <option value="replace">Replace them with this sheet</option>
            </select>
          </label>
        )}
      </div>

      <h3 className="res-xl-title">Match the columns</h3>
      <p className="res-muted small">We guessed what each column holds. Fix anything that's wrong. Totals, percentages and ranks are calculated for you, so total and rank columns can be skipped.</p>
      <div className="res-table-wrap">
        <table className="res-table res-xl-map">
          <thead>
            <tr>
              <th scope="col">Column in your sheet</th>
              <th scope="col">Sample values</th>
              <th scope="col">Import as</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h, c) => (
              <tr key={c} className={mapping[c] === 'ignore' ? 'is-off' : ''}>
                <td><strong>{h}</strong></td>
                <td className="res-xl-sample">{dataRows.slice(0, 3).map((r) => cellText(r[c])).filter(Boolean).join(' · ') || <span className="res-muted">(empty)</span>}</td>
                <td>
                  <select
                    value={mapping[c] || 'ignore'}
                    onChange={(e) => setMapping((m) => m.map((v, i) => (i === c ? e.target.value : v)))}
                    aria-label={`Import column ${h} as`}
                  >
                    {FIELD_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    {critOptions.length > 0 && (
                      <optgroup label="Marks for an existing criterion">
                        {critOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </optgroup>
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mapping.includes('new') && (
        <label className="res-check res-xl-scheme">
          <input type="checkbox" checked={replaceScheme} onChange={(e) => setReplaceScheme(e.target.checked)} />
          Use this sheet's mark columns as the whole marking scheme (replaces the current {criteria.length} criteria)
        </label>
      )}

      {preview && (
        <div className="res-xl-summary">
          {!hasName && <p className="res-error">Pick the column that holds each {noun.toLowerCase()}'s name.</p>}
          {hasName && (
            <p>
              <i className="bi bi-check2-circle" aria-hidden="true" /> Ready to import <strong>{preview.entries.length}</strong> {noun.toLowerCase()}{preview.entries.length === 1 ? '' : 's'}
              {preview.newCriteria.length > 0 && <> and <strong>{preview.newCriteria.length}</strong> new criteri{preview.newCriteria.length === 1 ? 'on' : 'a'} ({preview.newCriteria.map((c) => `${c.name} /${fmt(c.maxMarks)}`).join(', ')})</>}.
              {preview.skipped > 0 && <> {preview.skipped} row{preview.skipped === 1 ? '' : 's'} without a name will be skipped.</>}
            </p>
          )}
          {preview.overMax > 0 && (
            <p className="res-warn"><i className="bi bi-exclamation-triangle" aria-hidden="true" /> {preview.overMax} mark{preview.overMax === 1 ? ' is' : 's are'} above the criterion's maximum. They'll be highlighted in red after import, so you can fix the mark or raise the maximum.</p>
          )}
          <div className="res-actions">
            <button type="button" className="res-btn res-btn-primary" disabled={!hasName || !preview.entries.length} onClick={submit}>
              <i className="bi bi-box-arrow-in-down" aria-hidden="true" /> Import {preview.entries.length} row{preview.entries.length === 1 ? '' : 's'}
            </button>
            <button type="button" className="res-btn" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
