'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageUpload from './ImageUpload';
import type { MediaItem } from '@/lib/media';

export default function MediaLibrary({
  media,
  configured,
}: {
  media: MediaItem[];
  configured: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  function open(m: MediaItem) {
    setEditing(m);
    setTitle(m.title);
    setAltText(m.alt_text ?? '');
    setTags((m.tags ?? []).join(', '));
    setError('');
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/media', {
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
      setEditing(null);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const size = (b: number | null) =>
    b === null ? '' : b > 1_000_000
      ? `${(b / 1_048_576).toFixed(1)}MB`
      : `${Math.round(b / 1024)}KB`;

  return (
    <>
      <ImageUpload configured={configured} onUploaded={() => router.refresh()} />

      {error && <div className="alert alert-error">{error}</div>}

      {media.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          No images yet.
        </p>
      ) : (
        <>
          <h3 className="admin-h3" style={{ marginTop: '2rem' }}>
            {media.length} image{media.length === 1 ? '' : 's'}
          </h3>
          <div className="media-grid">
            {media.map((m) => (
              <figure className="media-card" key={m.id}>
                <button className="media-thumb" onClick={() => open(m)}>
                  <img src={m.secure_url} alt={m.alt_text ?? ''} loading="lazy" />
                </button>
                <figcaption>
                  <span className="media-title">{m.title}</span>
                  <span className="media-meta">
                    {m.width}&times;{m.height} {'\u00b7'} {size(m.bytes)}
                  </span>
                  {(m.block_count > 0 || m.is_hero) && (
                    <span className="pill p-classified">In use</span>
                  )}
                  {!m.alt_text && (
                    <span className="pill p-review">No description</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {editing && (
        <div className="media-panel">
          <div className="booking-head">
            <div>
              <h3>{editing.title}</h3>
              <p className="sub">
                Uploaded {editing.uploaded_at}
                {editing.uploaded_by_name
                  ? ` by ${editing.uploaded_by_name}`
                  : ''}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Close
            </button>
          </div>

          <img
            src={editing.secure_url}
            alt={editing.alt_text ?? ''}
            className="media-large"
          />

          {editing.used_in.length > 0 && (
            <div className="callout c-default">
              <strong>Used on the front page</strong>
              {editing.used_in.join(', ')}
              {editing.is_hero ? ' \u00b7 hero image' : ''}
            </div>
          )}

          <div className="field">
            <label htmlFor="md-title">Title</label>
            <input
              id="md-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="md-alt">Description for screen readers</label>
            <input
              id="md-alt"
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="md-tags">Tags</label>
            <input
              id="md-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="md-url">Image address</label>
            <p className="sub">
              Paste this into a front page block, or anywhere else that asks
              for an image URL.
            </p>
            <input id="md-url" type="text" readOnly value={editing.secure_url} />
          </div>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                send({
                  action: 'update',
                  id: editing.id,
                  title,
                  altText: altText || null,
                  tags: tags
                    ? tags.split(',').map((t) => t.trim()).filter(Boolean)
                    : null,
                })
              }
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(editing.secure_url);
                setCopied(editing.id);
                setTimeout(() => setCopied(''), 2000);
              }}
            >
              {copied === editing.id ? 'Copied' : 'Copy address'}
            </button>
            {editing.block_count === 0 && !editing.is_hero && (
              <button
                className="btn btn-ghost danger"
                disabled={busy}
                onClick={() => send({ action: 'archive', id: editing.id })}
              >
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
