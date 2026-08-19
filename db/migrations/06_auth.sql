-- ============================================================
-- Migration 06 — Password authentication and sessions
--
-- Email and password for now. sso_subject already exists on
-- users, so campus SSO can be added later as a second login
-- method without touching anything else.
-- ============================================================

ALTER TABLE users
  ADD COLUMN password_hash text,
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN last_sign_in_at timestamptz,
  ADD COLUMN failed_sign_ins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

-- A user must be reachable by one method or the other.
ALTER TABLE users
  ADD CONSTRAINT users_have_a_login
  CHECK (password_hash IS NOT NULL OR sso_subject IS NOT NULL);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text UNIQUE NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON sessions (expires_at);

CREATE TABLE email_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text UNIQUE NOT NULL,
  purpose     text NOT NULL,          -- 'verify_email' | 'reset_password'
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX ON email_verifications (user_id, purpose);
