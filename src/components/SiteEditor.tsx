'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteSettings, SiteBlock, MenuItemOption } from '@/lib/site';
import type { MediaItem } from '@/lib/media';

const KIND_LABEL: Record<string, string> = {
  news: 'News',
  menu_spotlight: 'Menu spotlight',
  staff_spotlight: 'Staff spotlight',
  gallery: 'Gallery',
};

const KIND_HINT: Record<string, string> = {
  news: 'Appears newest first under "Latest from the kitchen". A publish window lets you write something now and have it appear later.',
  menu_spotlight:
    'Link it to a menu item and the price comes from the live menu, so it cannot go out of date.',
  staff_spotlight:
    'A photograph, a name, a role, and a couple of sentences. Round portraits work best.',
  gallery: 'A full-width band of photographs. Best with four or more.',
};

const blank = (kind: SiteBlock['kind']): SiteBlock => ({
  id: '',
  kind,
  title: '',
  subtitle: null,
  body: null,
  image_url: null,
  image_alt: null,
  media_id: null,
  link_url: null,
  link_label: null,
  menu_item_id: null,
  menu_price: null,
  menu_unit: null,
  sort_order: 0,
  is_published: true,
  publish_from: null,
  publish_to: null,
});

export default function SiteEditor({
  settings,
  blocks,
  media,
  menuItems,
}: {
  settings: SiteSettings | null;
  blocks: SiteBlock[];
  media: MediaItem[];
  menuItems: MenuItemOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'settings' | SiteBlock['kind']>('settings');
  const [editing, setEditing] = useState<SiteBlock | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [s, setS] = useState({
    heroEyebrow: settings?.hero_eyebrow ?? '',
    heroTitle: settings?.hero_title ?? '',
    heroSubtitle: settings?.hero_subtitle ?? '',
    heroMediaId: settings?.hero_media_id ?? '',
    introHeading: settings?.intro_heading ?? '',
    introBody: settings?.intro_body ?? '',
    contactPhone: settings?.contact_phone ?? '',
    contactEmail: settings?.contact_email ?? '',
    officeHours: settings?.office_hours ?? '',
  });

  const heroImage = media.find((m) => m.id === s.heroMediaId);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/staff/site', {
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
      setSaved(true);
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const setB = (patch: Partial<SiteBlock>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  const tabs: ('settings' | SiteBlock['kind'])[] = [
    'settings',
    'news',
    'menu_spotlight',
    'staff_spotlight',
    'gallery',
  ];

  return (
    <>
      <div className="filters" role="group" aria-label="Section">
        {tabs.map((t) => (
          <button
            key={t}
            className="chip"
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setEditing(null);
              setSaved(false);
            }}
          >
            {t === 'settings' ? 'Hero and contact' : KIND_LABEL[t]}
            {t !== 'settings' && (
              <span className="n">
                {blocks.filter((b) => b.kind === t).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && !editing && (
        <div className="callout c-default">Saved. The front page is updated.</div>
      )}

      {/* ---------- hero and contact ---------- */}
      {tab === 'settings' && (
        <div className="admin-editor">
          <h3>The top of the page</h3>

          <div className="field">
            <label>Hero image</label>
            <p className="sub">
              Sits behind the title, darkened so text stays readable. A wide
              landscape photograph works best.
            </p>
            {heroImage ? (
              <div className="chosen-image">
                <img src={heroImage.secure_url} alt="" />
                <div>
                  <strong>{heroImage.title}</strong>
                  <div className="actions">
                    <button
                      className="edit-link"
                      onClick={() => setPicking(true)}
                    >
                      Change
                    </button>
                    <button
                      className="edit-link"
                      onClick={() => setS({ ...s, heroMediaId: '' })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setPicking(true)}>
                Choose an image
              </button>
            )}
          </div>

          <div className="grid two">
            <div className="field">
              <label htmlFor="se-eyebrow">Small line above the title</label>
              <input
                id="se-eyebrow"
                type="text"
                value={s.heroEyebrow}
                onChange={(e) => setS({ ...s, heroEyebrow: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="se-title">Title</label>
              <input
                id="se-title"
                type="text"
                value={s.heroTitle}
                onChange={(e) => setS({ ...s, heroTitle: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="se-sub">Subtitle</label>
            <p className="sub">One or two lines. Keep it short.</p>
            <textarea
              id="se-sub"
              value={s.heroSubtitle}
              onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })}
            />
          </div>

          <h4 className="admin-h4">Above the three gateways</h4>
          <div className="field">
            <label htmlFor="se-ih">Heading</label>
            <input
              id="se-ih"
              type="text"
              value={s.introHeading}
              onChange={(e) => setS({ ...s, introHeading: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="se-ib">Introduction</label>
            <textarea
              id="se-ib"
              value={s.introBody}
              onChange={(e) => setS({ ...s, introBody: e.target.value })}
            />
          </div>

          <h4 className="admin-h4">Contact</h4>
          <p className="sub" style={{ marginTop: '-.4rem' }}>
            Appears in the bar at the top and in the footer.
          </p>
          <div className="grid two">
            <div className="field">
              <label htmlFor="se-phone">Phone</label>
              <input
                id="se-phone"
                type="text"
                value={s.contactPhone}
                onChange={(e) => setS({ ...s, contactPhone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="se-email">Email</label>
              <input
                id="se-email"
                type="email"
                value={s.contactEmail}
                onChange={(e) => setS({ ...s, contactEmail: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="se-hours">Office hours</label>
            <input
              id="se-hours"
              type="text"
              value={s.officeHours}
              onChange={(e) => setS({ ...s, officeHours: e.target.value })}
            />
          </div>

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                send({
                  kind: 'settings',
                  heroEyebrow: s.heroEyebrow,
                  heroTitle: s.heroTitle,
                  heroSubtitle: s.heroSubtitle || null,
                  heroMediaId: s.heroMediaId || null,
                  introHeading: s.introHeading || null,
                  introBody: s.introBody || null,
                  contactPhone: s.contactPhone || null,
                  contactEmail: s.contactEmail || null,
                  officeHours: s.officeHours || null,
                })
              }
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <Link href="/" target="_blank" className="edit-link">
              View the front page
            </Link>
          </div>
        </div>
      )}

      {/* ---------- blocks ---------- */}
      {tab !== 'settings' && (
        <>
          <div className="admin-bar">
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(blank(tab));
                setSaved(false);
              }}
            >
              Add {KIND_LABEL[tab].toLowerCase()}
            </button>
            <span className="admin-note">{KIND_HINT[tab]}</span>
          </div>

          {editing && (
            <div className="admin-editor">
              <h3>{editing.id ? 'Edit' : 'New'} {KIND_LABEL[tab].toLowerCase()}</h3>

              <div className="field">
                <label>Image</label>
                {editing.media_id ? (
                  <div className="chosen-image">
                    <img
                      src={
                        media.find((m) => m.id === editing.media_id)
                          ?.secure_url ?? ''
                      }
                      alt=""
                    />
                    <div>
                      <strong>
                        {media.find((m) => m.id === editing.media_id)?.title}
                      </strong>
                      <div className="actions">
                        <button
                          className="edit-link"
                          onClick={() => setPicking(true)}
                        >
                          Change
                        </button>
                        <button
                          className="edit-link"
                          onClick={() => setB({ media_id: null })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPicking(true)}
                  >
                    Choose an image
                  </button>
                )}
              </div>

              {tab === 'menu_spotlight' && (
                <div className="field">
                  <label htmlFor="bl-menu">Menu item</label>
                  <p className="sub">
                    The price shown on the front page comes from here, so it
                    stays correct when the menu changes.
                  </p>
                  <select
                    id="bl-menu"
                    value={editing.menu_item_id ?? ''}
                    onChange={(e) =>
                      setB({
                        menu_item_id: e.target.value || null,
                        title:
                          editing.title ||
                          menuItems.find((m) => m.id === e.target.value)?.name ||
                          '',
                        subtitle:
                          editing.subtitle ||
                          menuItems.find((m) => m.id === e.target.value)
                            ?.category ||
                          null,
                      })
                    }
                  >
                    <option value="">No price shown</option>
                    {menuItems.map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.category} {'\u2014'} {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid two">
                <div className="field">
                  <label htmlFor="bl-title">
                    {tab === 'staff_spotlight' ? 'Name' : 'Title'}
                  </label>
                  <input
                    id="bl-title"
                    type="text"
                    value={editing.title}
                    onChange={(e) => setB({ title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bl-sub">
                    {tab === 'staff_spotlight'
                      ? 'Role'
                      : tab === 'news'
                        ? 'Tag above the headline'
                        : 'Subtitle'}
                  </label>
                  <input
                    id="bl-sub"
                    type="text"
                    value={editing.subtitle ?? ''}
                    onChange={(e) => setB({ subtitle: e.target.value || null })}
                  />
                </div>
              </div>

              {tab !== 'gallery' && (
                <div className="field">
                  <label htmlFor="bl-body">Text</label>
                  <textarea
                    id="bl-body"
                    value={editing.body ?? ''}
                    onChange={(e) => setB({ body: e.target.value || null })}
                  />
                </div>
              )}

              {tab === 'news' && (
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="bl-url">Link</label>
                    <p className="sub">Optional. Where "read more" goes.</p>
                    <input
                      id="bl-url"
                      type="text"
                      value={editing.link_url ?? ''}
                      onChange={(e) =>
                        setB({ link_url: e.target.value || null })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="bl-label">Link text</label>
                    <input
                      id="bl-label"
                      type="text"
                      placeholder="Read more"
                      value={editing.link_label ?? ''}
                      onChange={(e) =>
                        setB({ link_label: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              )}

              <h4 className="admin-h4">When it appears</h4>
              <div className="grid two">
                <div className="field">
                  <label htmlFor="bl-from">Show from</label>
                  <p className="sub">Leave blank to show immediately.</p>
                  <input
                    id="bl-from"
                    type="date"
                    value={editing.publish_from ?? ''}
                    onChange={(e) =>
                      setB({ publish_from: e.target.value || null })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="bl-to">Show until</label>
                  <p className="sub">Leave blank to show indefinitely.</p>
                  <input
                    id="bl-to"
                    type="date"
                    value={editing.publish_to ?? ''}
                    onChange={(e) =>
                      setB({ publish_to: e.target.value || null })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="bl-sort">Order</label>
                  <input
                    id="bl-sort"
                    type="number"
                    min={0}
                    value={editing.sort_order}
                    onChange={(e) =>
                      setB({ sort_order: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="field">
                  <label className="chk-inline" style={{ marginTop: '1.8rem' }}>
                    <input
                      type="checkbox"
                      checked={editing.is_published}
                      onChange={(e) => setB({ is_published: e.target.checked })}
                    />
                    Published
                  </label>
                </div>
              </div>

              <div className="actions">
                <button
                  className="btn btn-primary"
                  disabled={busy || !editing.title.trim()}
                  onClick={() =>
                    send({
                      kind: 'block',
                      id: editing.id || null,
                      blockKind: editing.kind,
                      title: editing.title,
                      subtitle: editing.subtitle,
                      body: editing.body,
                      mediaId: editing.media_id,
                      linkUrl: editing.link_url,
                      linkLabel: editing.link_label,
                      menuItemId: editing.menu_item_id,
                      isPublished: editing.is_published,
                      publishFrom: editing.publish_from,
                      publishTo: editing.publish_to,
                      sortOrder: editing.sort_order,
                    })
                  }
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                {editing.id && (
                  <button
                    className="btn btn-ghost danger"
                    disabled={busy}
                    onClick={() => send({ kind: 'delete', id: editing.id })}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="block-list">
            {blocks
              .filter((b) => b.kind === tab)
              .map((b) => (
                <div
                  className={`block-row${b.is_published ? '' : ' inactive'}`}
                  key={b.id}
                >
                  {b.image_url ? (
                    <img src={b.image_url} alt="" className="block-thumb" />
                  ) : (
                    <div className="block-thumb placeholder" />
                  )}
                  <div className="block-info">
                    <span className="block-title">{b.title}</span>
                    {b.subtitle && (
                      <span className="block-sub">{b.subtitle}</span>
                    )}
                    <span className="block-meta">
                      {!b.is_published && 'Not published'}
                      {b.publish_from && ` From ${b.publish_from}`}
                      {b.publish_to && ` until ${b.publish_to}`}
                      {b.is_published && !b.publish_from && !b.publish_to
                        ? 'Live'
                        : ''}
                    </span>
                  </div>
                  <button
                    className="edit-link"
                    onClick={() => {
                      setEditing(b);
                      setSaved(false);
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      {/* ---------- image picker ---------- */}
      {picking && (
        <div className="picker-scrim" onClick={() => setPicking(false)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <div className="booking-head">
              <h3>Choose an image</h3>
              <button className="btn btn-ghost" onClick={() => setPicking(false)}>
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
                      if (tab === 'settings') {
                        setS({ ...s, heroMediaId: m.id });
                      } else {
                        setB({ media_id: m.id });
                      }
                      setPicking(false);
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
