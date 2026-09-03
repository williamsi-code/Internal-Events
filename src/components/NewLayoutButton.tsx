'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LayoutSpace } from '@/lib/layouts';

export default function NewLayoutButton({
  spaces,
  requestId,
  label = 'Start a new layout',
}: {
  spaces: LayoutSpace[];
  requestId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) {
      setError('Give the layout a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          spaceId,
          requestId: requestId ?? null,
          name,
          isTemplate: !requestId,
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
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="admin-editor">
      <h3>New layout</h3>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid two">
        <div className="field">
          <label htmlFor="nl-space">Room</label>
          <select
            id="nl-space"
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
          >
            {spaces.map((s) => (
              <option value={s.id} key={s.id}>
                {s.building ? `${s.building} \u2014 ${s.name}` : s.name}
                {' ('}
                {s.width_feet}
                {'\u00d7'}
                {s.length_feet} ft{')'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nl-name">Name</label>
          <input
            id="nl-name"
            type="text"
            placeholder={requestId ? 'Reception layout' : 'Wedding, 180 rounds'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
        </div>
      </div>

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
