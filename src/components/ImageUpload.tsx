'use client';

import { useRef, useState } from 'react';
import { MEDIA_FOLDERS } from '@/lib/media-folders';

/**
 * Uploading images.
 *
 * The file goes from the browser straight to Cloudinary using a
 * signature this server produced, so the API secret stays server-side
 * and a large image never passes through Vercel.
 *
 * Several files at once, because nobody uploads one photograph from
 * an event.
 */

interface Pending {
  file: File;
  preview: string;
  title: string;
  altText: string;
  status: 'waiting' | 'uploading' | 'done' | 'failed';
  error?: string;
}

export default function ImageUpload({
  configured,
  defaultFolder = 'other',
  onUploaded,
}: {
  configured: boolean;
  defaultFolder?: string;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(defaultFolder);
  const [tags, setTags] = useState('');
  const [items, setItems] = useState<Pending[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="callout c-warn">
        <strong>Cloudinary is not connected</strong>
        Add <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code>{' '}
        and <code>CLOUDINARY_API_SECRET</code> to your environment variables,
        then redeploy.
      </div>
    );
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError('');
    const next: Pending[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} is not an image, so it was skipped.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is over 10MB, so it was skipped.`);
        continue;
      }
      next.push({
        file,
        preview: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        altText: '',
        status: 'waiting',
      });
    }

    setItems((prev) => [...prev, ...next]);
  }

  const update = (i: number, patch: Partial<Pending>) =>
    setItems((prev) => prev.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  async function uploadAll() {
    const missing = items.findIndex((i) => !i.title.trim());
    if (missing >= 0) {
      setError('Every image needs a title so you can find it again.');
      return;
    }

    setBusy(true);
    setError('');

    // One signature covers the batch: it is scoped to the folder and
    // valid for the session, not to a single file.
    const sigRes = await fetch('/api/staff/upload-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const sig = await sigRes.json();
    if (!sigRes.ok) {
      setError(sig.error ?? 'Could not prepare the upload.');
      setBusy(false);
      return;
    }

    const tagList = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;
      update(i, { status: 'uploading' });

      try {
        const form = new FormData();
        form.append('file', items[i].file);
        form.append('api_key', sig.apiKey);
        form.append('timestamp', String(sig.timestamp));
        form.append('signature', sig.signature);
        form.append('folder', sig.folder);

        const upRes = await fetch(sig.uploadUrl, { method: 'POST', body: form });
        const up = await upRes.json();

        if (!upRes.ok) {
          update(i, {
            status: 'failed',
            error: up?.error?.message ?? 'Cloudinary refused it',
          });
          continue;
        }

        const recRes = await fetch('/api/staff/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'record',
            publicId: up.public_id,
            secureUrl: up.secure_url,
            format: up.format ?? null,
            width: up.width ?? null,
            height: up.height ?? null,
            bytes: up.bytes ?? null,
            title: items[i].title,
            altText: items[i].altText || null,
            tags: tagList,
            folder,
          }),
        });

        update(i, {
          status: recRes.ok ? 'done' : 'failed',
          error: recRes.ok ? undefined : 'Uploaded but not saved to the library',
        });
      } catch {
        update(i, { status: 'failed', error: 'Upload failed' });
      }
    }

    setBusy(false);
    onUploaded();
  }

  const done = items.filter((i) => i.status === 'done').length;
  const remaining = items.filter((i) => i.status !== 'done');

  return (
    <div className="upload-box">
      <h3 className="admin-h3">Add images</h3>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="up-folder">Folder</label>
          <p className="sub">Where these belong in the library.</p>
          <select
            id="up-folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            {MEDIA_FOLDERS.map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="up-tags">Tags for all of these</label>
          <p className="sub">Comma separated. Optional.</p>
          <input
            id="up-tags"
            type="text"
            placeholder="wedding, buffet"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
      </div>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <span className="dropzone-main">
          Drop images here, or click to choose
        </span>
        <span className="dropzone-sub">
          JPG, PNG or WebP, up to 10MB each. Several at once is fine.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="upload-list">
            {items.map((it, i) => (
              <div className={`upload-row ${it.status}`} key={i}>
                <img src={it.preview} alt="" />
                <div className="upload-fields">
                  <input
                    type="text"
                    placeholder="Title"
                    value={it.title}
                    disabled={it.status === 'done'}
                    onChange={(e) => update(i, { title: e.target.value })}
                    aria-label="Title"
                  />
                  <input
                    type="text"
                    placeholder="What is in the picture, for screen readers"
                    value={it.altText}
                    disabled={it.status === 'done'}
                    onChange={(e) => update(i, { altText: e.target.value })}
                    aria-label="Description"
                  />
                </div>
                <div className="upload-status">
                  {it.status === 'done' && (
                    <span className="pill p-classified">Uploaded</span>
                  )}
                  {it.status === 'uploading' && (
                    <span className="pill p-review">Uploading</span>
                  )}
                  {it.status === 'failed' && (
                    <span className="pill p-flag">{it.error}</span>
                  )}
                  {it.status === 'waiting' && (
                    <button
                      className="edit-link"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, n) => n !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={uploadAll}
              disabled={busy || remaining.length === 0}
            >
              {busy
                ? 'Uploading...'
                : `Upload ${remaining.length} image${
                    remaining.length === 1 ? '' : 's'
                  }`}
            </button>
            {done > 0 && !busy && (
              <button className="btn btn-ghost" onClick={() => setItems([])}>
                Clear the list
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
