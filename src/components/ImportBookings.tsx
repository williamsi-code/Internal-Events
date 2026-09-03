'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import type { MatchedRow, ImportBatch } from '@/lib/imports';

/**
 * Importing room bookings from a spreadsheet.
 *
 * Parsed in the browser so a large file never crosses the network,
 * then previewed with every problem listed before anything is
 * written. The preview is the point: an import that silently does
 * the wrong thing to two hundred rows is worse than no import.
 */

const TARGETS = [
  { key: 'room', label: 'Room', required: true },
  { key: 'building', label: 'Building', required: false },
  { key: 'title', label: 'What it is', required: false },
  { key: 'date', label: 'Date', required: true },
  { key: 'startTime', label: 'Start time', required: false },
  { key: 'endTime', label: 'End time', required: false },
  { key: 'reference', label: 'Their reference', required: false },
  { key: 'note', label: 'Note', required: false },
] as const;

/** Guess which spreadsheet column is which, so the common case needs
 *  no mapping at all. */
function guessColumn(header: string, key: string) {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  const guesses: Record<string, string[]> = {
    room: ['room', 'space', 'location', 'venue', 'facility'],
    building: ['building', 'campus'],
    title: ['title', 'event', 'name', 'description', 'purpose', 'eventname'],
    date: ['date', 'eventdate', 'startdate', 'day'],
    startTime: ['start', 'starttime', 'from', 'begin', 'timestart'],
    endTime: ['end', 'endtime', 'to', 'finish', 'timeend'],
    reference: ['reference', 'ref', 'id', 'bookingid', 'confirmation'],
    note: ['note', 'notes', 'comment', 'comments', 'remarks'],
  };
  return (guesses[key] ?? []).some((g) => h === g || h.includes(g));
}

/** Excel dates arrive as serial numbers, times as fractions of a day. */
function toDateString(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function toTimeString(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const total = Math.round(v * 24 * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export default function ImportBookings({
  batches,
}: {
  batches: ImportBatch[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MatchedRow[] | null>(null);
  const [skipConflicts, setSkipConflicts] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(
    null
  );

  function reset() {
    setFilename('');
    setHeaders([]);
    setRaw([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function readFile(file: File) {
    setError('');
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });

      if (rows.length === 0) {
        setError('That sheet has no rows in it.');
        return;
      }

      const cols = Object.keys(rows[0]);
      const guessed: Record<string, string> = {};
      for (const t of TARGETS) {
        const hit = cols.find((c) => guessColumn(c, t.key));
        if (hit) guessed[t.key] = hit;
      }

      setFilename(file.name);
      setHeaders(cols);
      setRaw(rows);
      setMapping(guessed);
      setPreview(null);
    } catch {
      setError('Could not read that file. Is it a .xlsx or .csv?');
    }
  }

  function buildRows() {
    return raw.map((r, i) => ({
      rowNumber: i + 2, // +2: one for the header, one for 1-indexing
      room: String(r[mapping.room] ?? '').trim(),
      building: mapping.building
        ? String(r[mapping.building] ?? '').trim() || null
        : null,
      title: mapping.title
        ? String(r[mapping.title] ?? '').trim() || 'Imported booking'
        : 'Imported booking',
      date: toDateString(r[mapping.date]),
      startTime: mapping.startTime ? toTimeString(r[mapping.startTime]) : null,
      endTime: mapping.endTime ? toTimeString(r[mapping.endTime]) : null,
      reference: mapping.reference
        ? String(r[mapping.reference] ?? '').trim() || null
        : null,
      note: mapping.note ? String(r[mapping.note] ?? '').trim() || null : null,
    }));
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Something went wrong.');
        setBusy(false);
        return null;
      }
      setBusy(false);
      return d;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
      return null;
    }
  }

  async function runPreview() {
    if (!mapping.room || !mapping.date) {
      setError('Room and date must be mapped before previewing.');
      return;
    }
    const d = await send({ action: 'preview', rows: buildRows() });
    if (d) setPreview(d.rows);
  }

  async function commit() {
    const d = await send({
      action: 'commit',
      filename,
      sourceLabel: sourceLabel || null,
      rows: buildRows(),
      skipConflicts,
    });
    if (d) {
      setResult({ imported: d.imported, skipped: d.skipped });
      setPreview(null);
      router.refresh();
    }
  }

  const problems = preview?.filter((r) => r.problem) ?? [];
  const clashes = preview?.filter((r) => !r.problem && r.conflictsWith) ?? [];
  const clean = preview?.filter((r) => !r.problem && !r.conflictsWith) ?? [];
  const willImport = clean.length + (skipConflicts ? 0 : clashes.length);

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="callout c-default">
          <strong>
            Imported {result.imported} booking
            {result.imported === 1 ? '' : 's'}
          </strong>
          {result.skipped > 0 && `${result.skipped} rows were skipped. `}
          <Link href="/staff/schedule">See them on the schedule</Link>. If
          something is wrong, undo the batch below.
        </div>
      )}

      {/* ---------- 1. the file ---------- */}
      {!filename && (
        <div className="upload-box">
          <h3 className="admin-h3">Choose a spreadsheet</h3>
          <p className="sub">
            The first sheet is used. Columns are matched by name where we can
            recognise them, and you can correct anything we get wrong.
          </p>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <span className="dropzone-main">
              Drop a spreadsheet here, or click to choose
            </span>
            <span className="dropzone-sub">.xlsx or .csv</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </div>
        </div>
      )}

      {/* ---------- 2. mapping ---------- */}
      {filename && !preview && (
        <div className="admin-editor">
          <div className="booking-head">
            <div>
              <h3>{filename}</h3>
              <p className="sub">
                {raw.length} row{raw.length === 1 ? '' : 's'} found
              </p>
            </div>
            <button className="btn btn-ghost" onClick={reset}>
              Choose another
            </button>
          </div>

          <div className="field">
            <label htmlFor="im-source">Where has this come from?</label>
            <p className="sub">
              Shown on each imported booking, so staff know why it is there.
            </p>
            <input
              id="im-source"
              type="text"
              placeholder="Resource Scheduler export, September"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
            />
          </div>

          <h4 className="admin-h4">Which column is which</h4>
          <div className="map-grid">
            {TARGETS.map((t) => (
              <div className="field" key={t.key}>
                <label htmlFor={`map-${t.key}`}>
                  {t.label}
                  {t.required && <span className="req">*</span>}
                </label>
                <select
                  id={`map-${t.key}`}
                  value={mapping[t.key] ?? ''}
                  onChange={(e) =>
                    setMapping({ ...mapping, [t.key]: e.target.value })
                  }
                >
                  <option value="">
                    {t.required ? 'Choose a column' : 'Not in this sheet'}
                  </option>
                  {headers.map((h) => (
                    <option value={h} key={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <p className="sub">
            Rows with no start or end time are held from 8am to 5pm, which keeps
            the room visibly occupied without claiming a precision the
            spreadsheet did not have.
          </p>

          <div className="actions">
            <button className="btn btn-primary" onClick={runPreview} disabled={busy}>
              {busy ? 'Checking...' : 'Check the rows'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- 3. preview ---------- */}
      {preview && (
        <div className="admin-editor">
          <h3>What will happen</h3>

          <div className="cap-facts" style={{ marginBottom: '1.25rem' }}>
            <div className="cap-fact">
              <span className="cap-n">{clean.length}</span>
              <span className="cap-l">ready to import</span>
            </div>
            <div className={`cap-fact${clashes.length ? ' warn' : ''}`}>
              <span className="cap-n">{clashes.length}</span>
              <span className="cap-l">overlap something</span>
            </div>
            <div className={`cap-fact${problems.length ? ' bad' : ''}`}>
              <span className="cap-n">{problems.length}</span>
              <span className="cap-l">cannot be imported</span>
            </div>
          </div>

          {problems.length > 0 && (
            <>
              <h4 className="admin-h4">These will be skipped</h4>
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>What the sheet says</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.slice(0, 40).map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>
                          <span className="admin-name">
                            {r.room || '(no room)'}
                          </span>
                          <span className="admin-sub">
                            {r.title} {r.date ? `\u00b7 ${r.date}` : ''}
                          </span>
                        </td>
                        <td>
                          <span className="pill p-flag">{r.problem}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {problems.length > 40 && (
                <p className="sub">
                  And {problems.length - 40} more. Fixing the room names in the
                  spreadsheet and importing again is usually quicker than
                  correcting them here.
                </p>
              )}
            </>
          )}

          {clashes.length > 0 && (
            <>
              <h4 className="admin-h4">These overlap an existing booking</h4>
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Booking</th>
                      <th>Overlaps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clashes.slice(0, 25).map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>
                          <span className="admin-name">{r.title}</span>
                          <span className="admin-sub">
                            {r.spaceName} {'\u00b7'} {r.date}
                          </span>
                        </td>
                        <td>
                          <span className="admin-sub">{r.conflictsWith}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="chk-inline" style={{ marginTop: '.8rem' }}>
                <input
                  type="checkbox"
                  checked={skipConflicts}
                  onChange={(e) => setSkipConflicts(e.target.checked)}
                />
                Skip the overlapping rows
              </label>
              <p className="sub">
                Unticking imports them anyway as tentative holds, which is right
                if the spreadsheet is more current than what is already here.
              </p>
            </>
          )}

          {clean.length > 0 && (
            <>
              <h4 className="admin-h4">Ready to import</h4>
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Room</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clean.slice(0, 25).map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.title}</td>
                        <td>{r.spaceName}</td>
                        <td>
                          {r.date}
                          {r.startTime && (
                            <span className="admin-sub">
                              {r.startTime} {'\u2013'} {r.endTime ?? '17:00'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {clean.length > 25 && (
                <p className="sub">And {clean.length - 25} more.</p>
              )}
            </>
          )}

          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={commit}
              disabled={busy || willImport === 0}
            >
              {busy
                ? 'Importing...'
                : `Import ${willImport} booking${willImport === 1 ? '' : 's'}`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>
              Back to mapping
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              Start over
            </button>
          </div>
        </div>
      )}

      {/* ---------- past imports ---------- */}
      {batches.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h3 className="admin-h3">Past imports</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>File</th>
                <th className="num">Imported</th>
                <th className="num">Still live</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className={b.status === 'reverted' ? 'inactive' : ''}>
                  <td>
                    <span className="admin-name">{b.filename}</span>
                    <span className="admin-sub">
                      {b.created_at}
                      {b.imported_by_name ? ` \u00b7 ${b.imported_by_name}` : ''}
                    </span>
                    {b.source_label && (
                      <span className="admin-sub">{b.source_label}</span>
                    )}
                    {b.status === 'reverted' && (
                      <span className="pill p-cancelled">
                        Undone {b.reverted_at}
                      </span>
                    )}
                  </td>
                  <td className="num">{b.imported_count}</td>
                  <td className="num">{b.live_bookings}</td>
                  <td className="num">
                    {b.status !== 'reverted' && b.live_bookings > 0 && (
                      <button
                        className="edit-link"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove all ${b.live_bookings} bookings from this import?`
                            )
                          ) {
                            send({ action: 'revert', batchId: b.id }).then(
                              () => router.refresh()
                            );
                          }
                        }}
                      >
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
