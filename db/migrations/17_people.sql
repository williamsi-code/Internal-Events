-- ============================================================
-- Migration 17 - Account administration
--
-- Roles already exist and are already enforced. What was missing
-- is an audit trail for changing them: who granted what, to whom,
-- and when. Role changes are the one kind of edit where "nobody
-- remembers doing that" is a genuine problem.
-- ============================================================

CREATE TABLE role_changes (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  granted     boolean NOT NULL,
  changed_by  uuid NOT NULL REFERENCES users(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

CREATE INDEX ON role_changes (user_id, changed_at DESC);

-- Deactivating an account keeps its history intact. A staff member
-- who has classified fifty events should still be named on those
-- decisions after they leave.
COMMENT ON COLUMN users.is_active IS
  'False disables sign-in without removing the account or its history.';

-- Every account needs at least the requester role, so someone whose
-- staff access is removed can still see their own event requests.
INSERT INTO user_roles (user_id, role)
SELECT u.id, 'requester'
  FROM users u
 WHERE NOT EXISTS (
   SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'requester'
 )
ON CONFLICT DO NOTHING;
