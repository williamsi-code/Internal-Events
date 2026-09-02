'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SpaceDetail, SpacePhoto } from '@/lib/space-detail';
import type { MediaItem } from '@/lib/media';

export default function SpaceDetailEditor({
  space,
  photos,
  media,
}: {
  space: SpaceDetail;
  photos: SpacePhoto[];
  media: MediaItem[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<'hero' | 'floorplan' | 'gallery' | null>(
    null
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [f, setF] = useState({
    tagline: space.tagline ?? '',
    longDescription: space.long_description ?? '',
    features: space.features ?? '',
    setupOptions: space.setup_options ?? '',
    goodFor: space.good_for ?? '',
    accessibilityNotes: space.accessibility_notes ?? '',
    nearbyParking: space.nearby_parking ?? '',
    heroMediaId: space.hero_media_id ?? '',
    floorplanMediaId: space.floorplan_media_id ?? '',
  });

  const set = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    setSaved(false);
  };

  const hero = media.find((m) => m.id === f.heroMediaId);
  const plan = media.find((m) => m.id === f.floorplanMediaId);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/space-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }
      setSaved(true);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const saveDetails = () =>
    send({
      action: 'details',
      spaceId: space.id,
      tagline: f.tagline || null,
      longDescription: f.longDescription || null,
      features: f.features || null,
      setupOptions: f.setupOptions || null,
      goodFor: f.goodFor || null,
      accessibilityNotes: f.accessibilityNotes || null,
      nearbyParking: f.nearbyParking || null,
      heroMediaId: f.heroMediaId || null,
      floorplanMediaId: f.floorplanMediaId || null,
    });

  function ImageSlot({
    label,
    hint,
    item,
    onChoose,
    onClear,
  }: {
    label: string;
    hint: string;
    item: MediaItem | undefined;
    onChoose: () => void;
    onClear: () => void;
  }) {
    return (
      <div className="field">
        <label>{label}</label>
        <p className="sub">{hint}</p>
        {item ? (
          <div className="chosen-image">
            <img src={item.secure_url} alt="" />
            <div>
              <strong>{item.title}</strong>
              <div className="actions">
                <button className="edit-link" onClick={onChoose}>
                  Change
                </button>
                <button className="edit-link" onClick={onClear}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={onChoose}>
            Choose a photograph
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="callout c-default">Saved.</div>}

      <div className="admin-editor">
        <h3>What people see</h3>

        <ImageSlot
          label="Main photograph"
          hint="The first thing on the page, and what appears on related-room cards. A wide shot of the room laid out works best."
          item={hero}
          onChoose={() => setPicking('hero')}
          onClear={() => set({ heroMediaId: '' })}
        />

        <div className="field">
          <label htmlFor="sd-tagline">One-line description</label>
          <p className="sub">Sits under the room name.</p>
          <input
            id="sd-tagline"
            type="text"
            value={f.tagline}
            onChange={(e) => set({ tagline: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="sd-desc">About the room</label>
          <p className="sub">
            Two or three sentences for someone who has never been on campus.
            What is it like, what suits it, what makes it particular.
          </p>
          <textarea
            id="sd-desc"
            rows={5}
            value={f.longDescription}
            onChange={(e) => set({ longDescription: e.target.value })}
          />
        </div>

        <div className="grid two">
          <div className="field">
            <label htmlFor="sd-setup">Setup options</label>
            <p className="sub">
              One per line. Put the number after a dash and it becomes a table:
              <br />
              <code>Rounds of eight - 180</code>
            </p>
            <textarea
              id="sd-setup"
              rows={5}
              value={f.setupOptions}
              onChange={(e) => set({ setupOptions: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="sd-features">In the room</label>
            <p className="sub">One per line. Lighting, sound, screens.</p>
            <textarea
              id="sd-features"
              rows={5}
              value={f.features}
              onChange={(e) => set({ features: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="sd-good">Good for</label>
          <p className="sub">
            One per line. Shown in the sidebar. Receptions, dinners, lectures.
          </p>
          <textarea
            id="sd-good"
            rows={3}
            value={f.goodFor}
            onChange={(e) => set({ goodFor: e.target.value })}
          />
        </div>

        <div className="grid two">
          <div className="field">
            <label htmlFor="sd-parking">Parking</label>
            <textarea
              id="sd-parking"
              rows={3}
              value={f.nearbyParking}
              onChange={(e) => set({ nearbyParking: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="sd-access">Accessibility</label>
            <p className="sub">
              Step-free routes, lifts, accessible facilities. Worth being
              specific.
            </p>
            <textarea
              id="sd-access"
              rows={3}
              value={f.accessibilityNotes}
              onChange={(e) => set({ accessibilityNotes: e.target.value })}
            />
          </div>
        </div>

        <ImageSlot
          label="Floor plan"
          hint="Optional. Shown with pan and zoom, so a detailed plan works."
          item={plan}
          onChoose={() => setPicking('floorplan')}
          onClear={() => set({ floorplanMediaId: '' })}
        />

        <div className="actions">
          <button className="btn btn-primary" onClick={saveDetails} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          {space.slug && (
            <Link
              href={`/info/event-spaces/${space.slug}`}
              target="_blank"
              className="edit-link"
            >
              View the page
            </Link>
          )}
        </div>
      </div>

      <div className="admin-editor">
        <h3>More photographs</h3>
        <p className="sub">
          Shown as thumbnails under the main image. Different angles, the room
          set up different ways, details worth seeing.
        </p>

        {photos.length > 0 && (
          <div className="space-photo-list">
            {photos.map((p) => (
              <div className="space-photo-row" key={p.id}>
                <img src={p.secure_url} alt="" />
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor={`cap-${p.id}`} className="sr-only">
                    Caption
                  </label>
                  <input
                    id={`cap-${p.id}`}
                    type="text"
                    placeholder="Caption, optional"
                    defaultValue={p.caption ?? ''}
                    onBlur={(e) =>
                      send({
                        action: 'updatePhoto',
                        id: p.id,
                        caption: e.target.value || null,
                        sortOrder: p.sort_order,
                      })
                    }
                  />
                </div>
                <button
                  className="edit-link"
                  onClick={() => send({ action: 'removePhoto', id: p.id })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setPicking('gallery')}>
            Add a photograph
          </button>
        </div>
      </div>

      {picking && (
        <div className="picker-scrim" onClick={() => setPicking(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="booking-head">
              <h3>Choose a photograph</h3>
              <button className="btn btn-ghost" onClick={() => setPicking(null)}>
                Close
              </button>
            </div>
            {media.length === 0 ? (
              <p className="empty" style={{ padding: '2rem' }}>
                No images yet.{' '}
                <Link href="/staff/manage/media">Upload some first</Link>.
              </p>
            ) : (
              <div className="picker-grid">
                {media.map((m) => (
                  <button
                    key={m.id}
                    className="picker-item"
                    onClick={() => {
                      if (picking === 'hero') set({ heroMediaId: m.id });
                      else if (picking === 'floorplan')
                        set({ floorplanMediaId: m.id });
                      else
                        send({
                          action: 'addPhoto',
                          spaceId: space.id,
                          mediaId: m.id,
                          caption: null,
                        });
                      setPicking(null);
                    }}
                  >
                    <img src={m.secure_url} alt={m.alt_text ?? ''} loading="lazy" />
                    <span>{m.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
