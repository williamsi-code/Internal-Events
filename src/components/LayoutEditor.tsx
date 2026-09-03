'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutCanvas, type PlacedItem } from './LayoutCanvas';
import type { Layout, LayoutItem, LayoutPiece, LayoutSpace } from '@/lib/layouts';

/**
 * Drawing a room layout.
 *
 * Everything is in feet and snapped to a foot, which is close enough
 * for a floor plan and stops items sitting at 4.7381 feet from a
 * wall. Rotation snaps to 15 degrees for the same reason.
 *
 * The seat count is computed from what is actually placed, so it
 * cannot disagree with the drawing - which is the failure that makes
 * these diagrams untrustworthy.
 */

let localId = 0;
const nextLocalId = () => `new-${++localId}`;

export default function LayoutEditor({
  layout,
  space,
  items: initialItems,
  pieces,
  templates,
}: {
  layout: Layout;
  space: LayoutSpace;
  items: LayoutItem[];
  pieces: LayoutPiece[];
  templates: Layout[];
}) {
  const router = useRouter();
  const svgWrapRef = useRef<HTMLDivElement>(null);

  const width = Number(space.width_feet ?? 0);
  const length = Number(space.length_feet ?? 0);

  const pieceMap = useMemo(
    () => new Map(pieces.map((p) => [p.code, p])),
    [pieces]
  );

  const [items, setItems] = useState<PlacedItem[]>(
    initialItems.map((i) => ({
      id: i.id,
      piece_code: i.piece_code,
      x: Number(i.x_feet),
      y: Number(i.y_feet),
      rotation: i.rotation,
      label: i.label,
      seats_override: i.seats_override,
    }))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(layout.name);
  const [description, setDescription] = useState(layout.description ?? '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const selectedPiece = selected ? pieceMap.get(selected.piece_code) : null;

  const totalSeats = items.reduce((sum, i) => {
    const p = pieceMap.get(i.piece_code);
    return sum + (i.seats_override ?? p?.seats ?? 0);
  }, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, LayoutPiece[]>();
    for (const p of pieces) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return [...map.entries()];
  }, [pieces]);

  const touch = () => {
    setDirty(true);
    setSaved(false);
  };

  /** Screen coordinates to room feet. */
  const toFeet = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgWrapRef.current?.querySelector('svg');
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const pad = 6;
      const vbW = width + pad * 2;
      const vbH = length + pad * 2;
      const scale = Math.min(rect.width / vbW, rect.height / vbH);
      const offX = (rect.width - vbW * scale) / 2;
      const offY = (rect.height - vbH * scale) / 2;
      return {
        x: (clientX - rect.left - offX) / scale - pad,
        y: (clientY - rect.top - offY) / scale - pad,
      };
    },
    [width, length]
  );

  const snap = (v: number) => Math.round(v);

  function addPiece(code: string) {
    const p = pieceMap.get(code);
    if (!p) return;
    setItems((prev) => [
      ...prev,
      {
        id: nextLocalId(),
        piece_code: code,
        x: snap(width / 2),
        y: snap(length / 2),
        rotation: 0,
        label: null,
        seats_override: null,
      },
    ]);
    touch();
  }

  function onPointerDownItem(e: React.PointerEvent, id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const at = toFeet(e.clientX, e.clientY);
    drag.current = { id, dx: at.x - item.x, dy: at.y - item.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const at = toFeet(e.clientX, e.clientY);
    const d = drag.current;
    setItems((prev) =>
      prev.map((i) =>
        i.id === d.id
          ? {
              ...i,
              x: Math.max(0, Math.min(width, snap(at.x - d.dx))),
              y: Math.max(0, Math.min(length, snap(at.y - d.dy))),
            }
          : i
      )
    );
  }

  function onPointerUp() {
    if (drag.current) {
      drag.current = null;
      touch();
    }
  }

  function update(id: string, patch: Partial<PlacedItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    touch();
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
    touch();
  }

  function duplicate(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const copy = {
      ...item,
      id: nextLocalId(),
      x: Math.min(width, item.x + 3),
      y: Math.min(length, item.y + 3),
    };
    setItems((prev) => [...prev, copy]);
    setSelectedId(copy.id);
    touch();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const step = e.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      update(selected.id, {
        x: Math.max(0, Math.min(width, selected.x + dx)),
        y: Math.max(0, Math.min(length, selected.y + dy)),
      });
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(selected.id);
    }
    if (e.key === 'r' || e.key === 'R') {
      update(selected.id, { rotation: (selected.rotation + 15) % 360 });
    }
    if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      duplicate(selected.id);
    }
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not save.');
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

  async function save() {
    const d = await send({
      action: 'save',
      layoutId: layout.id,
      name,
      description: description || null,
      items: items.map((i, idx) => ({
        pieceCode: i.piece_code,
        x: i.x,
        y: i.y,
        rotation: i.rotation,
        label: i.label,
        seatsOverride: i.seats_override,
        sortOrder: idx,
      })),
    });
    if (d) {
      setDirty(false);
      setSaved(true);
      router.refresh();
    }
  }

  async function applyTemplate(templateId: string) {
    if (
      items.length > 0 &&
      !confirm('Replace everything currently in this room with the template?')
    ) {
      return;
    }
    const d = await send({ action: 'loadTemplate', templateId });
    if (d?.items) {
      setItems(
        d.items.map((i: LayoutItem) => ({
          id: nextLocalId(),
          piece_code: i.piece_code,
          x: Number(i.x_feet),
          y: Number(i.y_feet),
          rotation: i.rotation,
          label: i.label,
          seats_override: i.seats_override,
        }))
      );
      touch();
    }
  }

  if (!width || !length) {
    return (
      <div className="callout c-flag">
        <strong>This room has no dimensions</strong>
        A layout cannot be drawn to scale without them. Add the width and
        length in{' '}
        <Link href={`/staff/manage/spaces`}>Event spaces</Link> first.
      </div>
    );
  }

  return (
    <div className="layout-editor" onKeyDown={onKeyDown} tabIndex={-1}>
      {error && <div className="alert alert-error">{error}</div>}

      {/* ---------- palette ---------- */}
      <aside className="layout-palette">
        <h3>Add to the room</h3>
        {byCategory.map(([category, list]) => (
          <div className="palette-group" key={category}>
            <h4>{category}</h4>
            {list.map((p) => (
              <button
                key={p.code}
                className="palette-item"
                onClick={() => addPiece(p.code)}
              >
                <span
                  className={`palette-swatch ${p.shape}`}
                  style={{ background: p.colour }}
                />
                <span>
                  <span className="palette-label">{p.label}</span>
                  <span className="palette-meta">
                    {p.width_feet}
                    {'\u00d7'}
                    {p.length_feet} ft
                    {p.seats > 0 ? ` \u00b7 seats ${p.seats}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}

        {templates.length > 0 && (
          <div className="palette-group">
            <h4>Start from a template</h4>
            {templates.map((t) => (
              <button
                key={t.id}
                className="palette-item"
                onClick={() => applyTemplate(t.id)}
              >
                <span>
                  <span className="palette-label">{t.name}</span>
                  <span className="palette-meta">
                    {t.item_count} pieces {'\u00b7'} seats {t.seats}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ---------- canvas ---------- */}
      <div className="layout-stage">
        <div className="layout-toolbar">
          <div className="layout-counts">
            <span>
              <strong>{totalSeats}</strong> seats
            </span>
            <span>
              <strong>{items.length}</strong> pieces
            </span>
            {space.capacity_seated && totalSeats > space.capacity_seated && (
              <span className="over">
                Over the room&rsquo;s stated capacity of {space.capacity_seated}
              </span>
            )}
          </div>
          <div className="layout-actions">
            {dirty && <span className="unsaved">Unsaved changes</span>}
            {saved && <span className="savedmark">Saved</span>}
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving...' : 'Save layout'}
            </button>
          </div>
        </div>

        <div
          className="layout-canvas-wrap"
          ref={svgWrapRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <LayoutCanvas
            width={width}
            length={length}
            items={items}
            pieces={pieceMap}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPointerDownItem={onPointerDownItem}
            interactive
          />
        </div>

        <p className="layout-help">
          Drag to move. Arrow keys nudge a foot, with shift for five. Press R to
          rotate, Delete to remove.
        </p>
      </div>

      {/* ---------- properties ---------- */}
      <aside className="layout-props">
        <div className="field">
          <label htmlFor="ly-name">Layout name</label>
          <input
            id="ly-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touch();
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="ly-desc">Notes</label>
          <p className="sub">Shown to the customer with the diagram.</p>
          <textarea
            id="ly-desc"
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              touch();
            }}
          />
        </div>

        {selected && selectedPiece ? (
          <div className="prop-panel">
            <h4>{selectedPiece.label}</h4>
            <p className="sub">
              {selectedPiece.width_feet}
              {'\u00d7'}
              {selectedPiece.length_feet} ft
            </p>

            <div className="grid two">
              <div className="field">
                <label htmlFor="pr-x">Across (ft)</label>
                <input
                  id="pr-x"
                  type="number"
                  step={1}
                  value={selected.x}
                  onChange={(e) =>
                    update(selected.id, { x: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="pr-y">Down (ft)</label>
                <input
                  id="pr-y"
                  type="number"
                  step={1}
                  value={selected.y}
                  onChange={(e) =>
                    update(selected.id, { y: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="pr-rot">Rotation</label>
              <input
                id="pr-rot"
                type="range"
                min={0}
                max={345}
                step={15}
                value={selected.rotation}
                onChange={(e) =>
                  update(selected.id, { rotation: Number(e.target.value) })
                }
              />
              <span className="sub">{selected.rotation} degrees</span>
            </div>

            <div className="field">
              <label htmlFor="pr-label">Label on the diagram</label>
              <input
                id="pr-label"
                type="text"
                placeholder="Table 1"
                value={selected.label ?? ''}
                onChange={(e) =>
                  update(selected.id, { label: e.target.value || null })
                }
              />
            </div>

            {selectedPiece.seats > 0 && (
              <div className="field">
                <label htmlFor="pr-seats">Seats at this table</label>
                <p className="sub">
                  Leave blank for the usual {selectedPiece.seats}.
                </p>
                <input
                  id="pr-seats"
                  type="number"
                  min={0}
                  value={selected.seats_override ?? ''}
                  onChange={(e) =>
                    update(selected.id, {
                      seats_override: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
            )}

            <div className="actions">
              <button
                className="btn btn-ghost"
                onClick={() => duplicate(selected.id)}
              >
                Duplicate
              </button>
              <button
                className="btn btn-ghost danger"
                onClick={() => remove(selected.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <p className="sub">
            Select something in the room to move it, rotate it, or label it.
          </p>
        )}
      </aside>
    </div>
  );
}
