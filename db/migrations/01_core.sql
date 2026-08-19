-- ============================================================
-- Central College Events & Conferences
-- Event Intake, Classification & Routing — PostgreSQL schema
--
-- Maps to the Event Intake & Classification Form:
--   A. Requester & Event Information .... event_requests
--   B. Event Requirements ............... event_requirements
--   C. Funding & Outside Involvement .... event_funding
--   D. Classification Questions ......... classification_answers
--   E. Classification Decision .......... classification_decisions
--   F. Service / Financial Path ......... service_paths
--   G. Operational Capacity Check ....... capacity_checks
--   H. Approval / Routing ............... routing_actions
--
-- A-D are requester-facing and submitted together.
-- E-H are staff-facing and created after submission.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ------------------------------------------------------------
-- Enumerated types
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
  'requester',
  'events_staff',
  'service_approver',
  'admin'
);

CREATE TYPE affiliation AS ENUM (
  'department',
  'student_organization',
  'faculty_staff',
  'external_organization',
  'alumni',
  'other'
);

-- The full lifecycle. 'info_requested' is the loop that keeps
-- clarifying questions inside the system instead of in email.
CREATE TYPE request_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'info_requested',
  'classified',
  'details_pending',
  'confirmed',
  'completed',
  'cancelled',
  'denied'
);

CREATE TYPE classification AS ENUM (
  'internal',
  'affiliated',
  'external',
  'needs_management_review'
);

CREATE TYPE financial_path AS ENUM (
  'internal_non_revenue',
  'internal_revenue_generating',
  'affiliated_cost_recovery',
  'external_commercial'
);

CREATE TYPE service_level AS ENUM (
  'pickup',
  'delivery',
  'standard_service',
  'full_service',
  'institutional_vip',
  'per_contract'
);

CREATE TYPE routing_decision AS ENUM (
  'staff_may_proceed',
  'management_review_required',
  'leadership_exception_required'
);

CREATE TYPE control_party AS ENUM (
  'central',
  'shared',
  'outside',
  'unclear'
);

CREATE TYPE yes_no_unsure AS ENUM ('yes', 'no', 'unsure');

CREATE TYPE approval_state AS ENUM (
  'pending',
  'approved',
  'approved_with_conditions',
  'declined',
  'not_required'
);

-- ------------------------------------------------------------
-- People and organizations
-- ------------------------------------------------------------

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               citext UNIQUE NOT NULL,
  email_verified_at   timestamptz,
  full_name           text NOT NULL,
  phone               text,
  department_org      text,
  affiliation         affiliation NOT NULL DEFAULT 'other',
  -- Derived from the verified email domain; the cheapest reliable
  -- internal/external signal you have. Advisory, not authoritative.
  is_central_domain   boolean GENERATED ALWAYS AS
                        (email LIKE '%@central.edu') STORED,
  sso_subject         text UNIQUE,   -- populated if/when campus SSO is added
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES users(id),
  PRIMARY KEY (user_id, role)
);

-- Outside groups. They do not hold accounts; a Central user always
-- owns the request on their behalf.
CREATE TABLE outside_organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  contact_name          text,
  contact_email         citext,
  contact_phone         text,
  is_nonprofit          boolean,
  insurance_on_file     boolean NOT NULL DEFAULT false,
  insurance_expires_on  date,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Venue and catering reference data
-- ------------------------------------------------------------

CREATE TABLE spaces (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  building           text,
  capacity_seated    integer,
  capacity_standing  integer,
  supports_catering  boolean NOT NULL DEFAULT true,
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0
);

CREATE TABLE menu_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

-- Never delete a menu item — deactivate it. A completed event must
-- still render the item and price it was actually quoted.
CREATE TABLE menu_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid NOT NULL REFERENCES menu_categories(id),
  name              text NOT NULL,
  description       text,
  unit              text NOT NULL DEFAULT 'per person',
  minimum_quantity  integer,
  allergen_notes    text,
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0
);

-- Price varies by financial path, so it is a separate versioned row.
CREATE TABLE menu_item_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  path           financial_path NOT NULL,
  unit_price     numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  effective_from date NOT NULL,
  effective_to   date,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX ON menu_item_prices (menu_item_id, path, effective_from DESC);

-- ------------------------------------------------------------
-- A. Requester & Event Information
-- ------------------------------------------------------------

CREATE TABLE event_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-readable handle for phone calls and email subject lines.
  reference_code        text UNIQUE NOT NULL
                          DEFAULT 'EV-' || to_char(now(), 'YY') || '-' ||
                                  lpad((floor(random() * 100000))::text, 5, '0'),

  requester_id          uuid NOT NULL REFERENCES users(id),
  request_date          date NOT NULL DEFAULT CURRENT_DATE,

  -- Snapshot of requester details at submission. People change
  -- departments; the request should still show who asked and from where.
  requester_name        text NOT NULL,
  department_org        text NOT NULL,
  contact_email         citext NOT NULL,
  contact_phone         text,

  event_name            text NOT NULL,
  event_purpose         text NOT NULL,
  event_date            date NOT NULL,
  event_end_date        date,
  start_time            time,
  end_time              time,

  space_id              uuid REFERENCES spaces(id),
  location_freetext     text,   -- for spaces not in the list yet
  estimated_attendance  integer NOT NULL CHECK (estimated_attendance > 0),
  final_attendance      integer CHECK (final_attendance > 0),
  headcount_due_on      date,

  status                request_status NOT NULL DEFAULT 'draft',
  submitted_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CHECK (event_end_date IS NULL OR event_end_date >= event_date),
  CHECK (space_id IS NOT NULL OR location_freetext IS NOT NULL)
);

CREATE INDEX ON event_requests (status, event_date);
CREATE INDEX ON event_requests (requester_id, created_at DESC);
CREATE INDEX ON event_requests (event_date) WHERE status NOT IN ('cancelled', 'denied');

-- ------------------------------------------------------------
-- B. Event Requirements
-- ------------------------------------------------------------

CREATE TABLE event_requirements (
  request_id            uuid PRIMARY KEY REFERENCES event_requests(id) ON DELETE CASCADE,
  food_needs            text,
  service_expectations  text,
  room_setup            text,
  equipment             text,
  technology            text,
  special_requests      text,
  dietary_restrictions  text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Menu picked later in the flow, but priced against the path set in F.
CREATE TABLE request_menu_selections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  menu_item_id      uuid NOT NULL REFERENCES menu_items(id),
  quantity          integer NOT NULL CHECK (quantity > 0),
  -- Price frozen at selection time. Do not join to live prices for
  -- anything that has already been quoted.
  unit_price_quoted numeric(10,2) NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON request_menu_selections (request_id);

-- ------------------------------------------------------------
-- C. Funding & Outside Involvement
-- ------------------------------------------------------------

CREATE TABLE event_funding (
  request_id               uuid PRIMARY KEY REFERENCES event_requests(id) ON DELETE CASCADE,
  budget_account           text,
  outside_org_id           uuid REFERENCES outside_organizations(id),
  outside_org_name         text,   -- captured before the org record exists
  outside_org_involved     boolean NOT NULL DEFAULT false,
  outside_funding          boolean NOT NULL DEFAULT false,
  outside_funding_detail   text,
  revenue_collected        boolean NOT NULL DEFAULT false,
  revenue_detail           text,
  revenue_recipient        text,
  financial_risk_bearer    control_party,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- D. Classification Questions (requester's answers)
-- ------------------------------------------------------------

CREATE TABLE classification_answers (
  request_id             uuid PRIMARY KEY REFERENCES event_requests(id) ON DELETE CASCADE,
  official_business      yes_no_unsure NOT NULL,
  event_owner            control_party NOT NULL,
  primary_beneficiary    control_party NOT NULL,
  primary_payer          control_party NOT NULL,
  would_occur_without    yes_no_unsure NOT NULL,
  requester_notes        text,
  -- What the rules engine suggested at submission time. Stored so you can
  -- measure how often the advisory result matches the staff decision, and
  -- tune the rubric accordingly.
  suggested_class        classification,
  suggested_rationale    text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- E. Classification Decision (staff — append-only)
-- ------------------------------------------------------------

CREATE TABLE classification_decisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  classification classification NOT NULL,
  rationale      text NOT NULL,
  decided_by     uuid NOT NULL REFERENCES users(id),
  decided_at     timestamptz NOT NULL DEFAULT now(),
  supersedes_id  uuid REFERENCES classification_decisions(id),
  is_current     boolean NOT NULL DEFAULT true
);

-- Exactly one current decision per request.
CREATE UNIQUE INDEX one_current_classification
  ON classification_decisions (request_id) WHERE is_current;

-- ------------------------------------------------------------
-- F. Service / Financial Path (staff)
-- ------------------------------------------------------------

CREATE TABLE service_paths (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  path               financial_path NOT NULL,
  service_level      service_level NOT NULL,
  estimated_charge   numeric(10,2) CHECK (estimated_charge >= 0),
  special_costs      text,
  set_by             uuid NOT NULL REFERENCES users(id),
  set_at             timestamptz NOT NULL DEFAULT now(),
  is_current         boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX one_current_service_path
  ON service_paths (request_id) WHERE is_current;

-- ------------------------------------------------------------
-- G. Operational Capacity Check (staff)
-- ------------------------------------------------------------

CREATE TABLE capacity_checks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id               uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  staffing_available       boolean NOT NULL DEFAULT false,
  kitchen_capacity_ok      boolean NOT NULL DEFAULT false,
  facility_available       boolean NOT NULL DEFAULT false,
  equipment_available      boolean NOT NULL DEFAULT false,
  no_major_conflict        boolean NOT NULL DEFAULT false,
  revenue_impact_reviewed  boolean NOT NULL DEFAULT false,
  concerns                 text,
  alternatives_offered     text,
  checked_by               uuid NOT NULL REFERENCES users(id),
  checked_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON capacity_checks (request_id, checked_at DESC);

-- ------------------------------------------------------------
-- H. Approval / Routing (staff)
-- ------------------------------------------------------------

CREATE TABLE routing_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  decision    routing_decision NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_on date NOT NULL DEFAULT CURRENT_DATE,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON routing_actions (request_id, created_at DESC);

-- Parallel sign-offs from service areas (dining, facilities,
-- campus safety, risk management). Add rows only where needed.
CREATE TABLE service_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  area          text NOT NULL,
  state         approval_state NOT NULL DEFAULT 'pending',
  conditions    text,
  approver_id   uuid REFERENCES users(id),
  responded_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, area)
);

CREATE INDEX ON service_approvals (state) WHERE state = 'pending';

-- ------------------------------------------------------------
-- Workflow support: status history, messages, attachments, audit
-- ------------------------------------------------------------

CREATE TABLE request_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  from_status   request_status,
  to_status     request_status NOT NULL,
  changed_by    uuid REFERENCES users(id),
  reason        text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON request_status_history (request_id, changed_at DESC);

-- The 'info requested' back-and-forth. Keeps clarifications attached
-- to the request instead of scattered across inboxes.
CREATE TABLE request_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  author_id      uuid NOT NULL REFERENCES users(id),
  body           text NOT NULL,
  -- Staff-only notes are never shown to the requester.
  is_internal    boolean NOT NULL DEFAULT false,
  requires_reply boolean NOT NULL DEFAULT false,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON request_messages (request_id, created_at);

CREATE TABLE attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES event_requests(id) ON DELETE CASCADE,
  kind         text NOT NULL,  -- 'insurance_certificate', 'floor_plan', 'contract', ...
  file_name    text NOT NULL,
  storage_key  text NOT NULL,
  content_type text,
  byte_size    bigint,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON attachments (request_id);

-- Every mutation, for the "we never agreed to that" conversation.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  request_id  uuid REFERENCES event_requests(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  table_name  text,
  record_id   uuid,
  before      jsonb,
  after       jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_log (request_id, occurred_at DESC);

-- ------------------------------------------------------------
-- Convenience view: one row per request, current state only
-- ------------------------------------------------------------

CREATE VIEW request_overview AS
SELECT
  r.id,
  r.reference_code,
  r.event_name,
  r.event_date,
  r.status,
  r.estimated_attendance,
  r.department_org,
  s.name                AS space_name,
  cd.classification     AS current_classification,
  sp.path               AS current_financial_path,
  sp.service_level      AS current_service_level,
  sp.estimated_charge,
  ra.decision           AS latest_routing_decision,
  (SELECT count(*) FROM service_approvals sa
    WHERE sa.request_id = r.id AND sa.state = 'pending') AS pending_approvals
FROM event_requests r
LEFT JOIN spaces s  ON s.id = r.space_id
LEFT JOIN classification_decisions cd
       ON cd.request_id = r.id AND cd.is_current
LEFT JOIN service_paths sp
       ON sp.request_id = r.id AND sp.is_current
LEFT JOIN LATERAL (
  SELECT decision FROM routing_actions
   WHERE request_id = r.id
   ORDER BY created_at DESC LIMIT 1
) ra ON true;

