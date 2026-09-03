'use client';

import type { LayoutPiece } from '@/lib/layouts';

/**
 * Drawing one room to scale.
 *
 * The SVG viewBox is the room in feet, so everything inside is drawn
 * in real dimensions and the scale cannot drift. A 60 inch round is
 * five units across because it is five feet across.
 *
 * Shared by the editor and the read-only view the customer sees, so
 * what staff draw is exactly what the customer gets.
 */

export interface PlacedItem {
  id: string;
  piece_code: string;
  x: number;
  y: number;
  rotation: number;
  label: string | null;
  seats_override: number | null;
}

const GRID = 5; // feet between grid lines

export function LayoutCanvas({
  width,
  length,
  items,
  pieces,
  selectedId,
  onSelect,
  onPointerDownItem,
  showGrid = true,
  showSeats = true,
  interactive = false,
}: {
  width: number;
  length: number;
  items: PlacedItem[];
  pieces: Map<string, LayoutPiece>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onPointerDownItem?: (e: React.PointerEvent, id: string) => void;
  showGrid?: boolean;
  showSeats?: boolean;
  interactive?: boolean;
}) {
  const pad = 6; // feet of margin so labels near the wall stay readable

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
      className="layout-svg"
      onPointerDown={(e) => {
        if (interactive && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <defs>
        <pattern
          id="grid"
          width={GRID}
          height={GRID}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={0.08}
          />
        </pattern>
      </defs>

      {/* the room */}
      <rect
        x={0}
        y={0}
        width={width}
        height={length}
        fill={showGrid ? 'url(#grid)' : 'var(--surface)'}
        stroke="var(--ink)"
        strokeWidth={0.4}
      />

      {/* dimensions */}
      <text
        x={width / 2}
        y={-1.8}
        textAnchor="middle"
        className="layout-dim"
      >
        {width} ft
      </text>
      <text
        x={-2}
        y={length / 2}
        textAnchor="middle"
        className="layout-dim"
        transform={`rotate(-90 -2 ${length / 2})`}
      >
        {length} ft
      </text>

      {/* a ten foot scale bar, so a printed copy can be measured */}
      <g transform={`translate(0 ${length + 3})`}>
        <line x1={0} y1={0} x2={10} y2={0} stroke="var(--slate)" strokeWidth={0.25} />
        <line x1={0} y1={-0.6} x2={0} y2={0.6} stroke="var(--slate)" strokeWidth={0.25} />
        <line x1={10} y1={-0.6} x2={10} y2={0.6} stroke="var(--slate)" strokeWidth={0.25} />
        <text x={5} y={2.2} textAnchor="middle" className="layout-dim">
          10 ft
        </text>
      </g>

      {items.map((item) => {
        const piece = pieces.get(item.piece_code);
        if (!piece) return null;

        const w = Number(piece.width_feet);
        const h = Number(piece.length_feet);
        const seats = item.seats_override ?? piece.seats;
        const selected = selectedId === item.id;

        return (
          <g
            key={item.id}
            transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
            className={`layout-item${interactive ? ' interactive' : ''}${
              selected ? ' selected' : ''
            }`}
            onPointerDown={(e) => {
              if (!interactive) return;
              e.stopPropagation();
              onSelect?.(item.id);
              onPointerDownItem?.(e, item.id);
            }}
          >
            {/* seat dots, drawn first so furniture sits on top */}
            {showSeats && seats > 0 && (
              <SeatRing shape={piece.shape} w={w} h={h} seats={seats} />
            )}

            {piece.shape === 'round' ? (
              <circle
                r={w / 2}
                fill={piece.colour}
                stroke="var(--ink)"
                strokeWidth={0.12}
              />
            ) : (
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={0.2}
                fill={piece.colour}
                stroke="var(--ink)"
                strokeWidth={0.12}
              />
            )}

            {item.label && (
              <text
                y={0.5}
                textAnchor="middle"
                className="layout-label"
                transform={`rotate(${-item.rotation})`}
              >
                {item.label}
              </text>
            )}

            {selected && (
              <rect
                x={-w / 2 - 0.6}
                y={-h / 2 - 0.6}
                width={w + 1.2}
                height={h + 1.2}
                fill="none"
                stroke="var(--crimson)"
                strokeWidth={0.25}
                strokeDasharray="0.6 0.4"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Chairs around a table, so a layout reads as seating rather than
 *  as abstract shapes. */
function SeatRing({
  shape,
  w,
  h,
  seats,
}: {
  shape: string;
  w: number;
  h: number;
  seats: number;
}) {
  const dots = [];
  const r = 0.6; // a chair, roughly

  if (shape === 'round') {
    const ring = w / 2 + 1.1;
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
      dots.push(
        <circle
          key={i}
          cx={Math.cos(a) * ring}
          cy={Math.sin(a) * ring}
          r={r}
          className="layout-seat"
        />
      );
    }
  } else {
    // Along the long sides, split evenly.
    const perSide = Math.ceil(seats / 2);
    const offset = h / 2 + 1.1;
    for (let i = 0; i < seats; i++) {
      const side = i < perSide ? -1 : 1;
      const idx = i < perSide ? i : i - perSide;
      const n = i < perSide ? perSide : seats - perSide;
      const step = w / (n + 1);
      dots.push(
        <circle
          key={i}
          cx={-w / 2 + step * (idx + 1)}
          cy={side * offset}
          r={r}
          className="layout-seat"
        />
      );
    }
  }

  return <g>{dots}</g>;
}
