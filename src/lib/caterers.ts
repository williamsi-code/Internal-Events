import { query, one } from './db';

/**
 * Outside caterers.
 *
 * Approval is a status, but usability is a status plus current
 * paperwork. A caterer approved last year whose insurance lapsed in
 * March is not available today, and reading that through a view means
 * nobody has to remember to check.
 */

export interface Caterer {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  address: string | null;
  license_number: string | null;
  license_expires_on: string | null;
  insurance_carrier: string | null;
  insurance_expires_on: string | null;
  servsafe_certified: boolean;
  health_inspection_on: string | null;
  cuisine_notes: string | null;
  applicant_notes: string | null;
  status: 'pending' | 'approved' | 'declined' | 'suspended';
  status_note: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  applied_at: string;
  insurance_lapsed: boolean;
  license_lapsed: boolean;
  events_catered: number;
}

export async function listCaterers() {
  return query<Caterer>(
    `SELECT c.id, c.business_name, c.contact_name, c.contact_email,
            c.contact_phone, c.website, c.address,
            c.license_number,
            to_char(c.license_expires_on, 'YYYY-MM-DD') AS license_expires_on,
            c.insurance_carrier,
            to_char(c.insurance_expires_on, 'YYYY-MM-DD') AS insurance_expires_on,
            c.servsafe_certified,
            to_char(c.health_inspection_on, 'YYYY-MM-DD') AS health_inspection_on,
            c.cuisine_notes, c.applicant_notes,
            c.status, c.status_note,
            u.full_name AS reviewed_by_name,
            to_char(c.reviewed_at, 'Mon FMDD, YYYY') AS reviewed_at,
            to_char(c.applied_at, 'Mon FMDD, YYYY') AS applied_at,
            (c.insurance_expires_on IS NOT NULL
             AND c.insurance_expires_on < CURRENT_DATE) AS insurance_lapsed,
            (c.license_expires_on IS NOT NULL
             AND c.license_expires_on < CURRENT_DATE) AS license_lapsed,
            (SELECT count(*) FROM event_food_sources f
              WHERE f.caterer_id = c.id) AS events_catered
       FROM caterers c
       LEFT JOIN users u ON u.id = c.reviewed_by
      ORDER BY
        CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        c.business_name`
  );
}

export interface ApprovedCaterer {
  id: string;
  business_name: string;
  cuisine_notes: string | null;
  insurance_lapsed: boolean;
  license_lapsed: boolean;
}

/** What a requester can actually choose from. Lapsed paperwork is
 *  surfaced rather than hidden, so staff can see why a caterer they
 *  expected is flagged. */
export async function listApprovedCaterers() {
  return query<ApprovedCaterer>(
    `SELECT id, business_name, cuisine_notes,
            insurance_lapsed, license_lapsed
       FROM usable_caterers
      ORDER BY business_name`
  );
}

export interface CatererSummary {
  pending: number;
  approved: number;
  lapsing_soon: number;
}

export async function getCatererSummary() {
  return one<CatererSummary>(
    `SELECT
       (SELECT count(*) FROM caterers WHERE status = 'pending') AS pending,
       (SELECT count(*) FROM caterers WHERE status = 'approved') AS approved,
       (SELECT count(*) FROM caterers
         WHERE status = 'approved'
           AND insurance_expires_on IS NOT NULL
           AND insurance_expires_on BETWEEN CURRENT_DATE
               AND CURRENT_DATE + INTERVAL '60 days') AS lapsing_soon`
  );
}
