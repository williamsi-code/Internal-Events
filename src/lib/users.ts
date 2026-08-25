import { query } from './db';

/**
 * Account administration.
 *
 * Roles are additive and enforced at every staff route. A person
 * signing up gets 'requester' and nothing else, so the default for a
 * new account is that it can submit and track its own events and
 * reach nothing else.
 */

export interface Person {
  id: string;
  email: string;
  full_name: string;
  department_org: string | null;
  is_central_domain: boolean;
  is_active: boolean;
  email_verified: boolean;
  roles: string[];
  last_sign_in: string | null;
  created_at: string;
  requests_made: number;
  decisions_made: number;
}

export async function listPeople() {
  return query<Person>(
    `SELECT u.id, u.email, u.full_name, u.department_org,
            u.is_central_domain, u.is_active,
            (u.email_verified_at IS NOT NULL) AS email_verified,
            coalesce(
              array_agg(ur.role::text ORDER BY ur.role)
                FILTER (WHERE ur.role IS NOT NULL),
              '{}'
            ) AS roles,
            to_char(u.last_sign_in_at, 'Mon FMDD, YYYY') AS last_sign_in,
            to_char(u.created_at, 'Mon FMDD, YYYY') AS created_at,
            (SELECT count(*) FROM event_requests r
              WHERE r.requester_id = u.id) AS requests_made,
            (SELECT count(*) FROM classification_decisions cd
              WHERE cd.decided_by = u.id) AS decisions_made
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
      GROUP BY u.id
      ORDER BY u.is_active DESC, u.full_name`
  );
}

export interface RoleChange {
  full_name: string;
  role: string;
  granted: boolean;
  changed_by_name: string;
  changed_at: string;
}

export async function listRoleChanges(limit = 25) {
  return query<RoleChange>(
    `SELECT u.full_name, rc.role::text, rc.granted,
            b.full_name AS changed_by_name,
            to_char(rc.changed_at, 'Mon FMDD, YYYY') AS changed_at
       FROM role_changes rc
       JOIN users u ON u.id = rc.user_id
       JOIN users b ON b.id = rc.changed_by
      ORDER BY rc.changed_at DESC
      LIMIT $1`,
    [limit]
  );
}
