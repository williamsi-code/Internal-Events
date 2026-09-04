'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageUpload from './ImageUpload';
import { MEDIA_FOLDERS, FOLDER_LABEL } from '@/lib/media-folders';
import type { MediaItem } from '@/lib/media';

export default function MediaLibrary({
  media,
  configured,
}: {
  media: MediaItem[];
  configured: boolean;
}) {
  const router = useRouter();
  const [folder, setFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [tags, setTags] = useState('');
  const [itemFolder, setItemFolder] = useState('other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: media.length };
    for (const [key] of MEDIA_FOLDERS) map[key] = 0;
    for (const m of media) map[m.folder] = (map[m.folder] ?? 0) + 1;
    return map;
  }, [media]);

  const shown = media.filter((m) => {
    if (folder !== 'all' && m.folder !== folder) return false;
    if (
      search &&
      !`${m.title} ${(m.tags ?? []).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  function open(m: MediaItem) {
    setEditing(m);
    setTitle(m.title);
    setAltText(m.alt_text ?? '');
    setTags((m.tags ?? []).join(', '));
    setItemFolder(m.folder);
    setError('');
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      setSelected(new Set());
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const size = (b: number | null) =>
    b === null
      ? ''
      : b > 1_000_000
        ? `${(b / 1_048_576).toFixed(1)}MB`
        : `${Math.round(b / 1024)}KB`;

  return (
    <>
      <ImageUpload
        configured={configured}
        defaultFolder={folder === 'all' ? 'other' : folder}
        onUploaded={() => router.refresh()}
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-bar">
        <input
          type="search"
          placeholder="Search titles and tags"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '14rem' }}
          aria-label="Search images"
        />
        {selected.size > 0 && (
          <span className="admin-note">
            {selected.size} selected {'\u00b7'} move to{' '}
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                send({
                  action: 'move',
                  ids: [...selected],
                  folder: e.target.value,
                })
              }
              style={{ width: 'auto', display: 'inline-block' }}
              aria-label="Move selected images to a folder"
            >
              <option value="">Choose a folder</option>
              {MEDIA_FOLDERS.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      <div className="filters" role="group" aria-label="Folders">
        <button
          className="chip"
          aria-pressed={folder === 'all'}
          onClick={() => setFolder('all')}
        >
          Everything <span className="n">{counts.all}</span>
        </button>
        {MEDIA_FOLDERS.map(([v, l]) => (
          <button
            key={v}
            className="chip"
            aria-pressed={folder === v}
            onClick={() => setFolder(v)}
          >
            {l} <span className="n">{counts[v] ?? 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          {media.length === 0
            ? 'No images yet.'
            : 'Nothing in this folder matches.'}
        </p>
      ) : (
        <div className="media-grid">
          {shown.map((m) => (
            <figure
              className={`media-card${selected.has(m.id) ? ' picked' : ''}`}
              key={m.id}
            >
              <button className="media-thumb" onClick={() => open(m)}>
                <img src={m.secure_url} alt={m.alt_text ?? ''} loading="lazy" />
              </button>
              <label className="media-check">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  aria-label={`Select ${m.title}`}
                />
              </label>
              <figcaption>
                <span className="media-title">{m.title}</span>
                <span className="media-meta">
                  {FOLDER_LABEL[m.folder]} {'\u00b7'} {m.width}
                  {'\u00d7'}
                  {m.height} {'\u00b7'} {size(m.bytes)}
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

          <div className="grid two">
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
              <label htmlFor="md-folder">Folder</label>
              <select
                id="md-folder"
                value={itemFolder}
                onChange={(e) => setItemFolder(e.target.value)}
              >
                {MEDIA_FOLDERS.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
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
                  folder: itemFolder,
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
