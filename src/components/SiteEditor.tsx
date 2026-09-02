'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteSettings, SiteBlock, MenuItemOption, BlockKind } from '@/lib/site';
import type { MediaItem } from '@/lib/media';

const KIND_LABEL: Record<BlockKind, string> = {
  occasion: 'Occasions',
  testimonial: 'Testimonials',
  gallery: 'Gallery',
  menu_spotlight: 'Menu spotlights',
  news: 'News',
  staff_spotlight: 'Staff',
};

const KIND_HINT: Record<BlockKind, string> = {
  occasion:
    'The three cards below the hero. Weddings, celebrations, meetings. A photograph each makes the difference.',
  testimonial:
    'Only the first published one appears, in the crimson band. Put the quotation in the text field and the attribution in the subtitle.',
  gallery: 'A strip of past events. Best with four or more square photographs.',
  menu_spotlight:
    'Link one to a menu item and the price comes from the live menu, so it cannot go out of date.',
  news: 'Appears under "Latest from the kitchen". A publish window lets you write now and appear later.',
  staff_spotlight: 'Round portraits. A name, a role, and a couple of sentences.',
};

const ORDER: BlockKind[] = [
  'occasion',
  'testimonial',
  'gallery',
  'menu_spotlight',
  'news',
  'staff_spotlight',
];

const blank = (kind: BlockKind): SiteBlock => ({
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
  const [tab, setTab] = useState<'settings' | BlockKind>('settings');
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
    address: settings?.address ?? '',
    servicesHeading: settings?.services_heading ?? 'What we do',
    servicesList: settings?.services_list ?? '',
    amenitiesHeading: settings?.amenities_heading ?? 'What is included',
    amenitiesList: settings?.amenities_list ?? '',
    secondaryCtaLabel: settings?.secondary_cta_label ?? '',
    secondaryCtaUrl: settings?.secondary_cta_url ?? '',
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

  const isQuote = tab === 'testimonial';

  return (
    <>
      <div className="filters" role="group" aria-label="Section">
        <button
          className="chip"
          aria-pressed={tab === 'settings'}
          onClick={() => {
            setTab('settings');
            setEditing(null);
            setSaved(false);
          }}
        >
          Hero and details
        </button>
        {ORDER.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={tab === k}
            onClick={() => {
              setTab(k);
              setEditing(null);
              setSaved(false);
            }}
          >
            {KIND_LABEL[k]}
            <span className="n">{blocks.filter((b) => b.kind === k).length}</span>
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && !editing && (
        <div className="callout c-default">Saved. The front page is updated.</div>
      )}

      {/* ---------- hero and details ---------- */}
      {tab === 'settings' && (
        <div className="admin-editor">
          <h3>The top of the page</h3>

          <div className="field">
            <label>Hero photograph</label>
            <p className="sub">
              Sits beside the headline. A wide landscape shot of a set room or a
              served table works best.
            </p>
            {heroImage ? (
              <div className="chosen-image">
                <img src={heroImage.secure_url} alt="" />
                <div>
                  <strong>{heroImage.title}</strong>
                  <div className="actions">
                    <button className="edit-link" onClick={() => setPicking(true)}>
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
                Choose a photograph
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor="se-eyebrow">Small line above the headline</label>
            <input
              id="se-eyebrow"
              type="text"
              value={s.heroEyebrow}
              onChange={(e) => setS({ ...s, heroEyebrow: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="se-title">Headline</label>
            <input
              id="se-title"
              type="text"
              value={s.heroTitle}
              onChange={(e) => setS({ ...s, heroTitle: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="se-sub">Opening lines</label>
            <textarea
              id="se-sub"
              value={s.heroSubtitle}
              onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })}
            />
          </div>

          <div className="grid two">
            <div className="field">
              <label htmlFor="se-cta">Second button</label>
              <p className="sub">Beside "Start your event".</p>
              <input
                id="se-cta"
                type="text"
                value={s.secondaryCtaLabel}
                onChange={(e) =>
                  setS({ ...s, secondaryCtaLabel: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="se-ctaurl">Where it goes</label>
              <input
                id="se-ctaurl"
                type="text"
                value={s.secondaryCtaUrl}
                onChange={(e) => setS({ ...s, secondaryCtaUrl: e.target.value })}
              />
            </div>
          </div>

          <h4 className="admin-h4">What people get</h4>
          <p className="sub" style={{ marginTop: '-.4rem' }}>
            Two plain lists, one item per line. This answers the question every
            enquiry opens with, so it is worth being generous and specific.
          </p>
          <div className="grid two">
            <div className="field">
              <label htmlFor="se-sh">Left heading</label>
              <input
                id="se-sh"
                type="text"
                value={s.servicesHeading}
                onChange={(e) => setS({ ...s, servicesHeading: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="se-ah">Right heading</label>
              <input
                id="se-ah"
                type="text"
                value={s.amenitiesHeading}
                onChange={(e) =>
                  setS({ ...s, amenitiesHeading: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid two">
            <div className="field">
              <label htmlFor="se-sl">Left list</label>
              <textarea
                id="se-sl"
                rows={7}
                value={s.servicesList}
                onChange={(e) => setS({ ...s, servicesList: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="se-al">Right list</label>
              <textarea
                id="se-al"
                rows={7}
                value={s.amenitiesList}
                onChange={(e) => setS({ ...s, amenitiesList: e.target.value })}
              />
            </div>
          </div>

          <h4 className="admin-h4">Contact</h4>
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
            <div className="field">
              <label htmlFor="se-addr">Address</label>
              <input
                id="se-addr"
                type="text"
                value={s.address}
                onChange={(e) => setS({ ...s, address: e.target.value })}
              />
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
                  address: s.address || null,
                  servicesHeading: s.servicesHeading,
                  servicesList: s.servicesList || null,
                  amenitiesHeading: s.amenitiesHeading,
                  amenitiesList: s.amenitiesList || null,
                  secondaryCtaLabel: s.secondaryCtaLabel || null,
                  secondaryCtaUrl: s.secondaryCtaUrl || null,
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
              Add
            </button>
            <span className="admin-note">{KIND_HINT[tab]}</span>
          </div>

          {editing && (
            <div className="admin-editor">
              <h3>{editing.id ? 'Edit' : 'New'}</h3>

              {!isQuote && (
                <div className="field">
                  <label>Photograph</label>
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
                      Choose a photograph
                    </button>
                  )}
                </div>
              )}

              {tab === 'menu_spotlight' && (
                <div className="field">
                  <label htmlFor="bl-menu">Menu item</label>
                  <p className="sub">
                    The price on the front page comes from here, so it stays
                    correct when the menu changes.
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
                    {isQuote
                      ? 'Internal label'
                      : tab === 'staff_spotlight'
                        ? 'Name'
                        : 'Title'}
                  </label>
                  {isQuote && (
                    <p className="sub">Not shown. Just so you can find it.</p>
                  )}
                  <input
                    id="bl-title"
                    type="text"
                    value={editing.title}
                    onChange={(e) => setB({ title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bl-sub">
                    {isQuote
                      ? 'Who said it'
                      : tab === 'staff_spotlight'
                        ? 'Role'
                        : tab === 'occasion'
                          ? 'Small line above the title'
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
                  <label htmlFor="bl-body">
                    {isQuote ? 'The quotation' : 'Text'}
                  </label>
                  <textarea
                    id="bl-body"
                    value={editing.body ?? ''}
                    onChange={(e) => setB({ body: e.target.value || null })}
                  />
                </div>
              )}

              {(tab === 'news' || tab === 'occasion') && (
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="bl-url">Link</label>
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
                      value={editing.link_label ?? ''}
                      onChange={(e) =>
                        setB({ link_label: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid two">
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

              {tab === 'news' && (
                <div className="grid two">
                  <div className="field">
                    <label htmlFor="bl-from">Show from</label>
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
                    <input
                      id="bl-to"
                      type="date"
                      value={editing.publish_to ?? ''}
                      onChange={(e) =>
                        setB({ publish_to: e.target.value || null })
                      }
                    />
                  </div>
                </div>
              )}

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
                    {b.subtitle && <span className="block-sub">{b.subtitle}</span>}
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
              <h3>Choose a photograph</h3>
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
