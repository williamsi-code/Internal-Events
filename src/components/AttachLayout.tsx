'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Layout } from '@/lib/layouts';

/**
 * Starting a layout from an event.
 *
 * The room is already known from the booking, so there is nothing to
 * choose but a name and, usually, a template to start from. Most
 * events are a variation on a standard setup rather than a blank room.
 */

export default function AttachLayout({
  requestId,
  spaceName,
  templates,
  hasDimensions,
}: {
  requestId: string;
  spaceName: string | null;
  templates: Layout[];
  hasDimensions: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!spaceName) {
    return (
      <p className="sec-note">
        No room is booked for this event yet, so there is nothing to lay out.
      </p>
    );
  }

  if (!hasDimensions) {
    return (
      <div className="callout c-warn">
        <strong>{spaceName} has no dimensions recorded</strong>
        A layout has to be drawn to scale to be worth sending, so the room needs
        measuring first. Add the width and length in Event spaces.
      </div>
    );
  }

  async function create() {
    if (!name.trim()) {
      setError('Give the layout a name the customer will understand.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createForRequest',
          requestId,
          name,
          fromTemplateId: templateId || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not create it.');
        setBusy(false);
        return;
      }
      router.push(`/staff/manage/layouts/${d.layoutId}`);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="actions">
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          Draw a layout for this event
        </button>
      </div>
    );
  }

  return (
    <div className="attach-layout">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="al-name">What is this layout for?</label>
          <p className="sub">The customer sees this name.</p>
          <input
            id="al-name"
            type="text"
            placeholder="Reception, rounds of ten"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
        </div>
        <div className="field">
          <label htmlFor="al-template">Start from</label>
          <p className="sub">
            {templates.length > 0
              ? 'A template saves redrawing the usual setup.'
              : 'No templates for this room yet.'}
          </p>
          <select
            id="al-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={templates.length === 0}
          >
            <option value="">An empty room</option>
            {templates.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} ({t.seats} seats)
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="sub">
        Drawing in {spaceName}, the room booked for this event.
      </p>

      <div className="actions">
        <button className="btn btn-primary" onClick={create} disabled={busy}>
          {busy ? 'Creating...' : 'Create and start drawing'}
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
