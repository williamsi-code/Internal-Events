import type { Referral } from '@/lib/referrals';

/**
 * Caterers suggested to a requester whose event we could not take on.
 *
 * Contact details in full, because the point is that they can act on
 * it without another round of emails.
 */

export default function RequesterReferrals({
  referrals,
  keepsRoom,
}: {
  referrals: Referral[];
  keepsRoom: boolean;
}) {
  if (referrals.length === 0) return null;

  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Caterers we would suggest</h3>
      </div>
      <p className="sec-note">
        We are not able to cater this one ourselves. These are approved to work
        on campus, so they know the kitchens, the loading, and the rules.
      </p>

      <ul className="referral-list">
        {referrals.map((r) => (
          <li key={r.id}>
            <span>
              <span className="referral-name">{r.name}</span>
              {r.speciality && (
                <span className="referral-meta">{r.speciality}</span>
              )}
              {r.contact_name && (
                <span className="referral-meta">Ask for {r.contact_name}</span>
              )}
              <span className="referral-contact">
                {r.contact_phone && <span>{r.contact_phone}</span>}
                {r.contact_email && (
                  <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>
                )}
                {r.website && (
                  <a href={r.website} target="_blank" rel="noreferrer">
                    Website
                  </a>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {keepsRoom && (
        <div className="callout c-default">
          <strong>Your room booking still stands</strong>
          The space is held for you. Arrange the food with one of the above and
          let us know who you go with, so we can expect them.
        </div>
      )}
    </div>
  );
}
