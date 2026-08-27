'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Caterer } from '@/lib/caterers';

const STATUS_PILL: Record<string, [string, string]> = {
  pending: ['p-submitted', 'Awaiting review'],
  approved: ['p-classified', 'Approved'],
  declined: ['p-flag', 'Declined'],
  suspended: ['p-review', 'Suspended'],
};

export default function CaterersEditor({
  caterers,
}: {
  caterers: Caterer[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState('pending');
  const [open, setOpen] = useState<Caterer | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const counts = {
    pending: caterers.filter((c) => c.status === 'pending').length,
    approved: caterers.filter((c) => c.status === 'approved').length,
    problem: caterers.filter(
      (c) => c.status === 'approved' && (c.insurance_lapsed || c.license_lapsed)
    ).length,
    all: caterers.length,
  };

  const shown = caterers.filter((c) => {
    if (filter === 'pending') return c.status === 'pending';
    if (filter === 'approved') return c.status === 'approved';
    if (filter === 'problem')
      return c.status === 'approved' && (c.insurance_lapsed || c.license_lapsed);
    return true;
  });

  async function review(catererId: string, status: string) {
    setBusy(catererId + status);
    setError('');
    try {
      const res = await fetch('/api/staff/caterers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          catererId,
          status,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Could not save.');
        setBusy('');
        return;
      }
      setNote('');
      setOpen(null);
      router.refresh();
      setBusy('');
    } catch {
      setError('Could not reach the server.');
      setBusy('');
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {counts.problem > 0 && (
        <div className="callout c-flag">
          <strong>
            {counts.problem} approved caterer
            {counts.problem === 1 ? ' has' : 's have'} lapsed paperwork
          </strong>
          They will not appear in the list a requester can choose from until it
          is renewed.
        </div>
      )}

      <div className="filters" role="group" aria-label="Filter caterers">
        {(
          [
            ['pending', 'Awaiting review'],
            ['approved', 'Approved'],
            ['problem', 'Paperwork lapsed'],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} <span className="n">{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty" style={{ padding: '1.5rem 0' }}>
          Nothing in this view.
        </p>
      ) : (
        <div className="queue">
          {shown.map((c) => {
            const [cls, label] = STATUS_PILL[c.status];
            const expanded = open?.id === c.id;
            return (
              <div className="qcard" key={c.id} style={{ cursor: 'default' }}>
                <div className="qtop">
                  <span className="qref">{c.contact_email}</span>
                  <span className={`pill ${cls}`}>{label}</span>
                </div>
                <div className="qname">{c.business_name}</div>
                <div className="qmeta">
                  {c.contact_name}
                  {c.contact_phone ? ` \u00b7 ${c.contact_phone}` : ''}
                  {' \u00b7 applied '}
                  {c.applied_at}
                  {c.events_catered > 0
                    ? ` \u00b7 ${c.events_catered} event${c.events_catered === 1 ? '' : 's'}`
                    : ''}
                </div>
                <div className="qflags">
                  {c.servsafe_certified && (
                    <span className="pill p-type">ServSafe</span>
                  )}
                  {c.insurance_lapsed && (
                    <span className="pill p-flag">Insurance lapsed</span>
                  )}
                  {c.license_lapsed && (
                    <span className="pill p-flag">License lapsed</span>
                  )}
                  {!c.insurance_expires_on && (
                    <span className="pill p-review">No insurance date</span>
                  )}
                </div>

                <div className="actions" style={{ marginTop: '.75rem' }}>
                  <button
                    className="edit-link"
                    onClick={() => {
                      setOpen(expanded ? null : c);
                      setNote('');
                    }}
                  >
                    {expanded ? 'Hide details' : 'Details and decision'}
                  </button>
                </div>

                {expanded && (
                  <div className="caterer-detail">
                    <dl className="submission-dl">
                      {c.address && (
                        <>
                          <dt>Address</dt>
                          <dd>{c.address}</dd>
                        </>
                      )}
                      {c.website && (
                        <>
                          <dt>Website</dt>
                          <dd>{c.website}</dd>
                        </>
                      )}
                      <dt>Food service license</dt>
                      <dd>
                        {c.license_number ?? 'Not given'}
                        {c.license_expires_on
                          ? ` \u00b7 expires ${c.license_expires_on}`
                          : ''}
                      </dd>
                      <dt>Insurance</dt>
                      <dd>
                        {c.insurance_carrier ?? 'Not given'}
                        {c.insurance_expires_on
                          ? ` \u00b7 expires ${c.insurance_expires_on}`
                          : ''}
                      </dd>
                      <dt>Health inspection</dt>
                      <dd>{c.health_inspection_on ?? 'Not given'}</dd>
                      {c.cuisine_notes && (
                        <>
                          <dt>Cuisine</dt>
                          <dd>{c.cuisine_notes}</dd>
                        </>
                      )}
                      {c.applicant_notes && (
                        <>
                          <dt>Their notes</dt>
                          <dd>{c.applicant_notes}</dd>
                        </>
                      )}
                      {c.status_note && (
                        <>
                          <dt>Decision note</dt>
                          <dd>
                            {c.status_note}
                            {c.reviewed_by_name
                              ? ` \u2014 ${c.reviewed_by_name}, ${c.reviewed_at}`
                              : ''}
                          </dd>
                        </>
                      )}
                    </dl>

                    <div className="field" style={{ marginTop: '1rem' }}>
                      <label htmlFor={`note-${c.id}`}>Decision note</label>
                      <p className="sub">
                        Why approved, declined, or suspended. Kept on the record.
                      </p>
                      <textarea
                        id={`note-${c.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>

                    <div className="actions">
                      {c.status !== 'approved' && (
                        <button
                          className="btn btn-primary"
                          disabled={busy === c.id + 'approved'}
                          onClick={() => review(c.id, 'approved')}
                        >
                          Approve
                        </button>
                      )}
                      {c.status === 'approved' && (
                        <button
                          className="btn btn-ghost danger"
                          disabled={busy === c.id + 'suspended'}
                          onClick={() => review(c.id, 'suspended')}
                        >
                          Suspend
                        </button>
                      )}
                      {c.status !== 'declined' && (
                        <button
                          className="btn btn-ghost"
                          disabled={busy === c.id + 'declined'}
                          onClick={() => review(c.id, 'declined')}
                        >
                          Decline
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
