'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminPage } from '@/lib/admin';

export default function PolicyEditor({ pages }: { pages: AdminPage[] }) {
  const router = useRouter();
  const [active, setActive] = useState(pages[0]?.slug ?? '');
  const page = pages.find((p) => p.slug === active);

  const [title, setTitle] = useState(page?.title ?? '');
  const [intro, setIntro] = useState(page?.intro ?? '');
  const [body, setBody] = useState(page?.body ?? '');
  const [published, setPublished] = useState(page?.is_published ?? true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function switchTo(slug: string) {
    const p = pages.find((x) => x.slug === slug);
    if (!p) return;
    setActive(slug);
    setTitle(p.title);
    setIntro(p.intro ?? '');
    setBody(p.body);
    setPublished(p.is_published);
    setSaved(false);
    setError('');
  }

  async function save() {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are both required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'page',
          slug: active,
          title: title.trim(),
          intro: intro.trim() || null,
          body,
          isPublished: published,
        }),
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

  if (!page) return <p className="empty">No editable pages found.</p>;

  return (
    <>
      <div className="admin-tabs">
        {pages.map((p) => (
          <button
            key={p.slug}
            className="chip"
            aria-pressed={active === p.slug}
            onClick={() => switchTo(p.slug)}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="admin-editor">
        {error && <div className="alert alert-error">{error}</div>}
        {saved && (
          <div className="callout c-default">
            Saved. The public page is updated.
          </div>
        )}

        <div className="field">
          <label htmlFor="pg-title">Page title</label>
          <input
            id="pg-title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="pg-intro">Introduction</label>
          <p className="sub">
            One or two sentences under the heading, saying who this applies to.
          </p>
          <textarea
            id="pg-intro"
            value={intro}
            onChange={(e) => {
              setIntro(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="pg-body">Policy text</label>
          <p className="sub">
            Start a line with <code>##</code> for a heading and <code>-</code>{' '}
            for a bullet. Leave a blank line between paragraphs. Nothing else is
            interpreted, so you cannot break the page.
          </p>
          <textarea
            id="pg-body"
            className="body-editor"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <label className="chk-inline">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => {
              setPublished(e.target.checked);
              setSaved(false);
            }}
          />
          Visible to the public
        </label>

        <div className="actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : 'Save page'}
          </button>
          <a
            className="btn btn-ghost"
            href={`/info/${active}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none' }}
          >
            View public page
          </a>
        </div>

        <p className="admin-meta">
          Last updated {page.updated_at}
          {page.updated_by_name ? ` by ${page.updated_by_name}` : ''}
        </p>
      </div>
    </>
  );
}
