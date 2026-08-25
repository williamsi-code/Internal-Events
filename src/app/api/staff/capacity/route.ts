import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const CHECKS = z.object({
  staffing: z.boolean(),
  kitchen: z.boolean(),
  facility: z.boolean(),
  equipment: z.boolean(),
  noConflict: z.boolean(),
  revenueReviewed: z.boolean(),
});

const Body = z.object({
  requestId: z.string().uuid(),
  outcome: z.enum(['proceed', 'alternative_offered', 'declined']),
  checks: CHECKS,
  concerns: z.string().max(4000).nullable(),
  // Alternative
  proposedDate: z.string().date().nullable().optional(),
  proposedSpaceId: z.string().uuid().nullable().optional(),
  proposedDetail: z.string().max(4000).nullable().optional(),
  // Decline
  declineReason: z
    .enum([
      'staffing_capacity',
      'kitchen_capacity',
      'facility_unavailable',
      'equipment_unavailable',
      'date_conflict',
      'price_not_accepted',
      'requester_withdrew',
      'policy_or_risk',
      'other',
    ])
    .nullable()
    .optional(),
  estimatedRevenueLost: z.number().min(0).max(1_000_000).nullable().optional(),
  outsideCatererReferred: z.boolean().optional(),
  message: z.string().max(4000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the values.' }, { status: 400 });
  }
  const b = parsed.data;

  if (b.outcome === 'declined' && !b.declineReason) {
    return NextResponse.json(
      { error: 'Choose a reason for declining. It feeds the quarterly report.' },
      { status: 400 }
    );
  }
  if (b.outcome === 'alternative_offered' && !b.proposedDetail?.trim()) {
    return NextResponse.json(
      { error: 'Describe the alternative you are offering.' },
      { status: 400 }
    );
  }

  const current = await one<{ status: string }>(
    'SELECT status FROM event_requests WHERE id = $1',
    [b.requestId]
  );
  if (!current) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  try {
    await transaction(async (c) => {
      await c.query(
        `INSERT INTO capacity_checks (
           request_id, staffing_available, kitchen_capacity_ok,
           facility_available, equipment_available, no_major_conflict,
           revenue_impact_reviewed, concerns, alternatives_offered,
           checked_by, outcome, proposed_date, proposed_space_id,
           proposed_detail, decline_reason, estimated_revenue_lost,
           outside_caterer_referred
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          b.requestId,
          b.checks.staffing, b.checks.kitchen, b.checks.facility,
          b.checks.equipment, b.checks.noConflict, b.checks.revenueReviewed,
          b.concerns, b.proposedDetail ?? null, user!.id,
          b.outcome, b.proposedDate ?? null, b.proposedSpaceId ?? null,
          b.proposedDetail ?? null, b.declineReason ?? null,
          b.estimatedRevenueLost ?? null, b.outsideCatererReferred ?? false,
        ]
      );

      // A declined request stops here. An offered alternative goes back
      // to the requester to accept or not. Proceeding changes nothing
      // about status - the event carries on through its normal path.
      if (b.outcome === 'declined') {
        await c.query(
          `UPDATE event_requests SET status = 'denied', updated_at = now()
            WHERE id = $1`,
          [b.requestId]
        );
        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'denied', $3, $4)`,
          [b.requestId, current.status, user!.id,
           b.concerns || 'Declined at capacity check']
        );
      } else if (b.outcome === 'alternative_offered') {
        await c.query(
          `UPDATE event_requests SET status = 'info_requested', updated_at = now()
            WHERE id = $1`,
          [b.requestId]
        );
        await c.query(
          `INSERT INTO request_status_history
             (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, 'info_requested', $3, 'Alternative offered')`,
          [b.requestId, current.status, user!.id]
        );
      }

      if (b.message?.trim()) {
        await c.query(
          `INSERT INTO request_messages
             (request_id, author_id, body, is_internal, requires_reply)
           VALUES ($1, $2, $3, false, $4)`,
          [b.requestId, user!.id, b.message,
           b.outcome === 'alternative_offered']
        );
      }
    });
  } catch (err) {
    console.error('capacity check failed:', err);
    return NextResponse.json(
      { error: 'Could not record the check.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
