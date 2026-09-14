import { query } from './db';

/**
 * Caterer referrals.
 *
 * When Central cannot take an event on, naming who could is a better
 * answer than a refusal. It also keeps the event on campus: the room
 * survives even when the catering does not.
 */

export interface Referral {
  id: string;
  caterer_id: string | null;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  speciality: string | null;
  is_approved: boolean;
}

export async function getReferrals(requestId: string) {
  return query<Referral>('SELECT * FROM referrals_for($1)', [requestId]);
}

export interface ReferralCaterer {
  id: string;
  business_name: string;
  speciality: string | null;
  contact_phone: string | null;
  referrals_this_year: number;
  last_referred: string | null;
}

/** Who can be offered: approved, insured, and active. Sorted so the
 *  least recently used comes first, which spreads the work rather
 *  than sending everything to whoever is at the top of the list. */
export async function listReferrableCaterers() {
  return query<ReferralCaterer>(
    `SELECT oc.id, oc.business_name, oc.cuisine_notes AS speciality, oc.contact_phone,
            coalesce(rc.referrals_this_year, 0) AS referrals_this_year,
            rc.last_referred
       FROM usable_caterers oc
       LEFT JOIN caterer_referral_counts rc ON rc.id = oc.id
      ORDER BY coalesce(rc.referrals_this_year, 0), oc.business_name`
  );
}
