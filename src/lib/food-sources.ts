import { query, one } from './db';

/**
 * Food sources on a request.
 *
 * A set rather than a single value, because catering can be split.
 * Everything that needs to know whether Central is cooking reads it
 * from here rather than inferring it from the requirements text.
 */

export interface RequestFoodSource {
  id: string;
  kind: 'central_dining' | 'outside_caterer' | 'donated' | 'no_food';
  caterer_id: string | null;
  caterer_name: string | null;
  caterer_other: string | null;
  caterer_status: string | null;
  insurance_lapsed: boolean | null;
  covers: string | null;
  policy_acknowledged_at: string | null;
}

export async function getFoodSources(requestId: string) {
  return query<RequestFoodSource>(
    `SELECT f.id, f.kind, f.caterer_id,
            c.business_name AS caterer_name,
            f.caterer_other,
            c.status::text AS caterer_status,
            (c.insurance_expires_on IS NOT NULL
             AND c.insurance_expires_on < CURRENT_DATE) AS insurance_lapsed,
            f.covers,
            to_char(f.policy_acknowledged_at, 'Mon FMDD, YYYY')
              AS policy_acknowledged_at
       FROM event_food_sources f
       LEFT JOIN caterers c ON c.id = f.caterer_id
      WHERE f.request_id = $1
      ORDER BY
        CASE f.kind
          WHEN 'central_dining' THEN 0
          WHEN 'outside_caterer' THEN 1
          WHEN 'donated' THEN 2
          ELSE 3
        END`,
    [requestId]
  );
}

export interface FacilityChargeState {
  has_central: boolean;
  is_split: boolean;
  suggested: string;
  applied: string | null;
  note: string | null;
  set_by_name: string | null;
  set_at: string | null;
  space_name: string | null;
  rate_basis: string | null;
}

export async function getFacilityCharge(requestId: string) {
  return one<FacilityChargeState>(
    `SELECT has_central_dining($1) AS has_central,
            (has_central_dining($1) AND EXISTS (
               SELECT 1 FROM event_food_sources f
                WHERE f.request_id = $1
                  AND f.kind IN ('outside_caterer','donated')
             )) AS is_split,
            suggested_facility_charge($1)::text AS suggested,
            r.facility_charge_applied::text AS applied,
            r.facility_charge_note AS note,
            u.full_name AS set_by_name,
            to_char(r.facility_charge_set_at, 'Mon FMDD, YYYY') AS set_at,
            s.name AS space_name,
            s.rate_basis
       FROM event_requests r
       LEFT JOIN spaces s ON s.id = r.space_id
       LEFT JOIN users u ON u.id = r.facility_charge_set_by
      WHERE r.id = $1`,
    [requestId]
  );
}

export const FOOD_SOURCE_LABEL: Record<string, string> = {
  central_dining: 'Central Dining',
  outside_caterer: 'Outside caterer',
  donated: 'Donated food',
  no_food: 'No food',
};
