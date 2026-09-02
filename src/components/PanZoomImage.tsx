'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A photograph you can look around.
 *
 * Drag to pan, wheel or pinch to zoom, double-click to reset. Written
 * directly rather than pulled from a library because the behaviour is
 * about eighty lines and a dependency here would be larger than the
 * component.
 *
 * Panning is clamped so the image cannot be dragged off screen -
 * losing the picture entirely is the most annoying thing these
 * viewers do.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export default function PanZoomImage({
  src,
  alt,
  caption,
  height = '30rem',
}: {
  src: string;
  alt: string;
  caption?: string | null;
  height?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const pinchStart = useRef<number | null>(null);

  /** Keep the image covering the frame at any zoom level. */
  const clamp = useCallback(
    (x: number, y: number, s: number) => {
      const frame = frameRef.current;
      if (!frame) return { x, y };
      const maxX = (frame.clientWidth * (s - 1)) / 2;
      const maxY = (frame.clientHeight * (s - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    []
  );

  const zoomTo = useCallback(
    (next: number) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
      setScale(s);
      setOffset((o) => (s === 1 ? { x: 0, y: 0 } : clamp(o.x, o.y, s)));
    },
    [clamp]
  );

  function onPointerDown(e: React.PointerEvent) {
    if (scale === 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const next = clamp(
      dragStart.current.ox + (e.clientX - dragStart.current.x),
      dragStart.current.oy + (e.clientY - dragStart.current.y),
      scale
    );
    setOffset(next);
  }

  function endDrag() {
    setDragging(false);
  }

  // Non-passive so the page does not scroll while zooming the picture.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      zoomTo(scale - e.deltaY * 0.003);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStart.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current) {
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        zoomTo(scale * (d / pinchStart.current));
        pinchStart.current = d;
      }
    };

    const onTouchEnd = () => {
      pinchStart.current = null;
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: false });
    frame.addEventListener('touchend', onTouchEnd);

    return () => {
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
    };
  }, [scale, zoomTo]);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <figure className="panzoom">
      <div
        ref={frameRef}
        className={`panzoom-frame${dragging ? ' dragging' : ''}${
          scale > 1 ? ' zoomed' : ''
        }`}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={() => (scale > 1 ? reset() : zoomTo(2))}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform .18s ease-out',
          }}
        />

        <div className="panzoom-controls">
          <button
            type="button"
            onClick={() => zoomTo(scale - 0.5)}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            type="button"
            onClick={() => zoomTo(scale + 0.5)}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
          >
            +
          </button>
          {scale > 1 && (
            <button type="button" onClick={reset} aria-label="Reset view">
              Reset
            </button>
          )}
        </div>

        {scale === 1 && (
          <span className="panzoom-hint">Scroll or pinch to zoom</span>
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
