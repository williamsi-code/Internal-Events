'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarFeed } from '@/lib/feeds';

/**
 * Managing calendar feeds.
 *
 * The important thing this interface has to convey is that a feed URL
 * is a password. Anyone with the link sees the bookings, forever,
 * until the link is changed.
 */

export default function CalendarFeeds({
  feeds,
  buildings,
  spaces,
  categories,
  baseUrl,
}: {
  feeds: CalendarFeed[];
  buildings: { building: string }[];
  spaces: { id: string; name: string; building: string | null }[];
  categories: { category: string }[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarFeed | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    label: '',
    scope: 'building' as 'all' | 'building' | 'space' | 'category',
    building: buildings[0]?.building ?? '',
    spaceId: spaces[0]?.id ?? '',
    category: categories[0]?.category ?? '',
    showDetails: true,
    includeTentative: true,
  });

  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  const urlFor = (token: string) => `${baseUrl}/calendar/${token}.ics`;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/feeds', {
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
      setOpen(false);
      setEditing(null);
      router.refresh();
      setBusy(false);
      return d;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
      return null;
    }
  }

  function copy(token: string, id: string) {
    navigator.clipboard?.writeText(urlFor(token));
    setCopied(id);
    setTimeout(() => setCopied(''), 2500);
  }

  const describe = (feed: CalendarFeed) => {
    if (feed.scope === 'all') return 'Every space on campus';
    if (feed.scope === 'building') return feed.building;
    if (feed.scope === 'space') return feed.space_name;
    return feed.category;
  };

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="callout c-warn">
        <strong>A feed link is a password</strong>
        Outlook fetches with no credentials, so anyone holding the link can see
        those bookings. Share them with named people rather than posting them
        anywhere, and change the link if one gets out.
      </div>

      <div className="feed-list">
        {feeds.map((feed) => (
          <div
            className={`feed-row${feed.is_active ? '' : ' inactive'}`}
            key={feed.id}
          >
            <div className="feed-main">
              <span className="feed-label">{feed.label}</span>
              <span className="feed-scope">
                {describe(feed)}
                {' \u00b7 '}
                {feed.event_count} event{feed.event_count === 1 ? '' : 's'}
                {!feed.show_details && ' \u00b7 busy only'}
                {!feed.include_tentative && ' \u00b7 confirmed only'}
              </span>
              {feed.is_active && (
                <code className="feed-url">{urlFor(feed.token)}</code>
              )}
              <span className="feed-meta">
                {feed.last_fetched_at
                  ? `Last fetched ${feed.last_fetched_at} \u00b7 ${feed.fetch_count} times`
                  : 'Never fetched'}
              </span>
            </div>

            <div className="feed-actions">
              {feed.is_active && (
                <button
                  className="btn btn-ghost"
                  onClick={() => copy(feed.token, feed.id)}
                >
                  {copied === feed.id ? 'Copied' : 'Copy link'}
                </button>
              )}
              <button className="edit-link" onClick={() => setEditing(feed)}>
                Settings
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="admin-editor">
          <h3>{editing.label}</h3>

          <div className="field">
            <label htmlFor="fe-label">Name</label>
            <p className="sub">
              What subscribers see as the calendar name in Outlook.
            </p>
            <input
              id="fe-label"
              type="text"
              defaultValue={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
          </div>

          <label className="chk-inline">
            <input
              type="checkbox"
              checked={editing.show_details}
              onChange={(e) =>
                setEditing({ ...editing, show_details: e.target.checked })
              }
            />
            Show event names and details
          </label>
          <p className="sub">
            Untick and entries read &ldquo;Vermeer Banquet Room in use&rdquo;
            with no further detail, which suits a facilities calendar.
          </p>

          <label className="chk-inline" style={{ marginTop: '.6rem' }}>
            <input
              type="checkbox"
              checked={editing.include_tentative}
              onChange={(e) =>
                setEditing({ ...editing, include_tentative: e.target.checked })
              }
            />
            Include tentative holds
          </label>

          <label className="chk-inline" style={{ marginTop: '.6rem' }}>
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) =>
                setEditing({ ...editing, is_active: e.target.checked })
              }
            />
            Feed is live
          </label>
          <p className="sub">
            Turning it off makes the link stop working without deleting it.
          </p>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                send({
                  action: 'update',
                  feedId: editing.id,
                  label: editing.label,
                  showDetails: editing.show_details,
                  includeTentative: editing.include_tentative,
                  isActive: editing.is_active,
                })
              }
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              className="btn btn-ghost danger"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    'Everyone currently subscribed will stop receiving updates and will need the new link. Continue?'
                  )
                ) {
                  send({ action: 'regenerate', feedId: editing.id });
                }
              }}
            >
              Change the link
            </button>
          </div>
        </div>
      )}

      {open ? (
        <div className="admin-editor">
          <h3>New calendar feed</h3>

          <div className="grid two">
            <div className="field">
              <label htmlFor="nf-label">Name</label>
              <input
                id="nf-label"
                type="text"
                placeholder="Graham Conference Center"
                value={f.label}
                onChange={(e) => set({ label: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="nf-scope">Covers</label>
              <select
                id="nf-scope"
                value={f.scope}
                onChange={(e) => set({ scope: e.target.value as typeof f.scope })}
              >
                <option value="all">Everything on campus</option>
                <option value="building">One building</option>
                <option value="space">One room</option>
                <option value="category">A kind of space</option>
              </select>
            </div>
          </div>

          {f.scope === 'building' && (
            <div className="field">
              <label htmlFor="nf-building">Which building</label>
              <select
                id="nf-building"
                value={f.building}
                onChange={(e) => set({ building: e.target.value })}
              >
                {buildings.map((b) => (
                  <option value={b.building} key={b.building}>
                    {b.building}
                  </option>
                ))}
              </select>
            </div>
          )}

          {f.scope === 'space' && (
            <div className="field">
              <label htmlFor="nf-space">Which room</label>
              <select
                id="nf-space"
                value={f.spaceId}
                onChange={(e) => set({ spaceId: e.target.value })}
              >
                {spaces.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.building ? `${s.building} \u2014 ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {f.scope === 'category' && (
            <div className="field">
              <label htmlFor="nf-cat">Which kind</label>
              <select
                id="nf-cat"
                value={f.category}
                onChange={(e) => set({ category: e.target.value })}
              >
                {categories.map((c) => (
                  <option value={c.category} key={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="chk-inline">
            <input
              type="checkbox"
              checked={f.showDetails}
              onChange={(e) => set({ showDetails: e.target.checked })}
            />
            Show event names and details
          </label>
          <label className="chk-inline" style={{ marginTop: '.6rem' }}>
            <input
              type="checkbox"
              checked={f.includeTentative}
              onChange={(e) => set({ includeTentative: e.target.checked })}
            />
            Include tentative holds
          </label>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy || !f.label.trim()}
              onClick={() =>
                send({
                  action: 'create',
                  label: f.label,
                  scope: f.scope,
                  building: f.building || null,
                  spaceId: f.spaceId || null,
                  category: f.category || null,
                  showDetails: f.showDetails,
                  includeTentative: f.includeTentative,
                })
              }
            >
              {busy ? 'Creating...' : 'Create the feed'}
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            New calendar feed
          </button>
        </div>
      )}
    </>
  );
}
