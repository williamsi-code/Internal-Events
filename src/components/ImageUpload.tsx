'use client';

import { useRef, useState } from 'react';

/**
 * Uploading an image.
 *
 * The file goes from the browser straight to Cloudinary using a
 * signature this server produced. Our server never handles the file,
 * which keeps large images away from Vercel's request size limit and
 * keeps the API secret out of the browser.
 */

export default function ImageUpload({
  configured,
  onUploaded,
}: {
  configured: boolean;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [tags, setTags] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="callout c-warn">
        <strong>Cloudinary is not connected</strong>
        Add <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code>{' '}
        and <code>CLOUDINARY_API_SECRET</code> to your environment variables,
        then redeploy. Until then, images can only be added by URL.
      </div>
    );
  }

  function pick(f: File | null) {
    setError('');
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('That is not an image.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('That image is over 10MB. Try a smaller one.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  }

  async function upload() {
    if (!file) {
      setError('Choose an image first.');
      return;
    }
    if (!title.trim()) {
      setError('Give it a title so you can find it again.');
      return;
    }

    setBusy(true);
    setError('');
    setProgress(5);

    try {
      const sigRes = await fetch('/api/staff/upload-signature', {
        method: 'POST',
      });
      const sig = await sigRes.json();
      if (!sigRes.ok) {
        setError(sig.error ?? 'Could not prepare the upload.');
        setBusy(false);
        return;
      }

      setProgress(15);

      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.apiKey);
      form.append('timestamp', String(sig.timestamp));
      form.append('signature', sig.signature);
      form.append('folder', sig.folder);

      const upRes = await fetch(sig.uploadUrl, {
        method: 'POST',
        body: form,
      });
      const up = await upRes.json();

      if (!upRes.ok) {
        setError(up?.error?.message ?? 'Cloudinary rejected the upload.');
        setBusy(false);
        return;
      }

      setProgress(75);

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
          title,
          altText: altText || null,
          tags: tags
            ? tags.split(',').map((t) => t.trim()).filter(Boolean)
            : null,
        }),
      });

      if (!recRes.ok) {
        const d = await recRes.json();
        setError(d.error ?? 'Uploaded, but could not save it to the library.');
        setBusy(false);
        return;
      }

      setProgress(100);
      setFile(null);
      setPreview(null);
      setTitle('');
      setAltText('');
      setTags('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
      setBusy(false);
      setProgress(0);
    } catch {
      setError('Upload failed. Check your connection and try again.');
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="upload-box">
      <h3 className="admin-h3">Add an image</h3>

      {error && <div className="alert alert-error">{error}</div>}

      <div
        className={`dropzone${preview ? ' has-file' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="" className="dropzone-preview" />
        ) : (
          <>
            <span className="dropzone-main">
              Drop an image here, or click to choose
            </span>
            <span className="dropzone-sub">JPG, PNG or WebP, up to 10MB</span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>

      {file && (
        <>
          <div className="grid two">
            <div className="field">
              <label htmlFor="up-title">Title</label>
              <p className="sub">How you will find it again.</p>
              <input
                id="up-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="up-tags">Tags</label>
              <p className="sub">Comma separated. Optional.</p>
              <input
                id="up-tags"
                type="text"
                placeholder="ballroom, wedding, buffet"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="up-alt">Description for screen readers</label>
            <p className="sub">
              What is in the picture, for someone who cannot see it. Worth
              writing &mdash; it is also what search engines read.
            </p>
            <input
              id="up-alt"
              type="text"
              placeholder="A buffet table set for a reception in the Vermeer Banquet Room"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
            />
          </div>

          {busy && (
            <div className="upload-progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={upload} disabled={busy}>
              {busy ? 'Uploading...' : 'Upload'}
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setPreview(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
