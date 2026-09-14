'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KIND_LABEL, type SetupOption } from '@/lib/setup-labels';

/**
 * Which setup, equipment and technology a room offers.
 *
 * Unticking something removes it from the intake form for that room,
 * so nobody asks for a projector in a room without one.
 */

export default function SpaceOptionsEditor({
  spaceId,
  allOptions,
  selected,
}: {
  spaceId: string;
  allOptions: SetupOption[];
  selected: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(selected);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const kinds = ['setup', 'equipment', 'technology'] as const;

  function toggle(id: string) {
    setSaved(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function toggleKind(kind: string, on: boolean) {
    setSaved(false);
    const ids = allOptions.filter((o) => o.kind === kind).map((o) => o.id);
    setPicked((p) =>
      on ? [...new Set([...p, ...ids])] : p.filter((x) => !ids.includes(x))
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/space-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId, optionIds: picked }),
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

  return (
    <div className="admin-editor">
      <h3>What this room can do</h3>
      <p className="sub">
        Only what is ticked appears on the intake form for this room. Nobody
        should be asked whether they want a stage in a space that cannot hold
        one.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="callout c-default">Saved.</div>}

      {kinds.map((kind) => {
        const inKind = allOptions.filter((o) => o.kind === kind);
        const allOn = inKind.every((o) => picked.includes(o.id));

        return (
          <fieldset className="setup-group" key={kind}>
            <legend>
              {KIND_LABEL[kind]}
              <button
                type="button"
                className="edit-link"
                style={{ marginLeft: '.6rem', fontWeight: 400 }}
                onClick={() => toggleKind(kind, !allOn)}
              >
                {allOn ? 'none' : 'all'}
              </button>
            </legend>
            <div className="setup-options">
              {inKind.map((o) => (
                <div
                  className={`setup-option${
                    picked.includes(o.id) ? ' picked' : ''
                  }`}
                  key={o.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.includes(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                    <span>
                      <span className="setup-label">{o.label}</span>
                      {o.help_text && (
                        <span className="setup-help">{o.help_text}</span>
                      )}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}

      <div className="actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save what this room offers'}
        </button>
      </div>
    </div>
  );
}
