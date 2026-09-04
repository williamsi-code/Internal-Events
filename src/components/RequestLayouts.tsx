import Link from 'next/link';
import { LayoutCanvas } from './LayoutCanvas';
import AttachLayout from './AttachLayout';
import {
  getRequestLayouts,
  getSharedLayouts,
  getLayoutItems,
  getSpaceForRequest,
  listLayouts,
  listPieces,
} from '@/lib/layouts';

/**
 * Layouts on an event.
 *
 * Staff see every layout including drafts, plus the control to draw a
 * new one. A requester sees only what has been sent. Same rendering
 * either way, so what staff approve is exactly what the customer gets.
 */

export default async function RequestLayouts({
  requestId,
  isStaff,
}: {
  requestId: string;
  isStaff: boolean;
}) {
  const layouts = isStaff
    ? await getRequestLayouts(requestId)
    : await getSharedLayouts(requestId);

  // Staff need the room and its templates whether or not a layout
  // exists yet, so the "draw one" control can be offered. The room
  // comes from the request rather than a prop, so the caller does not
  // have to know which field holds it.
  const space = isStaff ? await getSpaceForRequest(requestId) : null;
  const templates =
    isStaff && space
      ? (await listLayouts(space.id)).filter((l) => l.is_template)
      : [];

  if (layouts.length === 0) {
    if (!isStaff) return null;
    return (
      <div className="sec">
        <div className="sec-head">
          <h3>Room layout</h3>
        </div>
        <p className="sec-note">
          Nothing drawn for this event yet.
        </p>
        <AttachLayout
          requestId={requestId}
          spaceName={space?.name ?? null}
          templates={templates}
          hasDimensions={!!space?.width_feet}
        />
      </div>
    );
  }

  const pieces = await listPieces();
  const pieceMap = new Map(pieces.map((p) => [p.code, p]));

  const rendered = await Promise.all(
    layouts.map(async (l) => ({
      layout: l,
      items: await getLayoutItems(l.id),
    }))
  );

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Room layout</h3>
      </div>

      {rendered.map(({ layout, items }) => (
        <figure className="shared-layout" key={layout.id}>
          <figcaption>
            <div>
              <strong>{layout.name}</strong>
              <span className="sub">
                {layout.space_name} {'\u00b7'} seats {layout.seats}
                {layout.width_feet
                  ? ` \u00b7 ${layout.width_feet}\u00d7${layout.length_feet} ft`
                  : ''}
              </span>
            </div>
            {isStaff && (
              <span
                className={`pill ${
                  layout.shared_at ? 'p-classified' : 'p-review'
                }`}
              >
                {layout.shared_at ? `Sent ${layout.shared_at}` : 'Not sent'}
              </span>
            )}
          </figcaption>

          <div className="shared-layout-canvas">
            <LayoutCanvas
              width={Number(layout.width_feet ?? 0)}
              length={Number(layout.length_feet ?? 0)}
              items={items.map((i) => ({
                id: i.id,
                piece_code: i.piece_code,
                x: Number(i.x_feet),
                y: Number(i.y_feet),
                rotation: i.rotation,
                label: i.label,
                seats_override: i.seats_override,
              }))}
              pieces={pieceMap}
              showGrid={false}
            />
          </div>

          {layout.description && <p className="info-p">{layout.description}</p>}

          {isStaff && (
            <div className="actions">
              <Link
                href={`/staff/manage/layouts/${layout.id}`}
                className="edit-link"
              >
                {layout.shared_at ? 'Edit or take it back' : 'Edit and send'}
              </Link>
            </div>
          )}
        </figure>
      ))}

      {isStaff ? (
        <AttachLayout
          requestId={requestId}
          spaceName={space?.name ?? null}
          templates={templates}
          hasDimensions={!!space?.width_feet}
        />
      ) : (
        <p className="sub">
          Drawn to scale. If something is not right, send us a message and we
          will redraw it.
        </p>
      )}
    </div>
  );
}
