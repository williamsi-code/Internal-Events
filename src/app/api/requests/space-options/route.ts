import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { classify } from '@/lib/classify';
import { getSessionUser } from '@/lib/auth';

const Party = z.enum(['central', 'shared', 'outside', 'unclear']);
const YesNoUnsure = z.enum(['yes', 'no', 'unsure']);

const Body = z.object({
  eventTypeId: z.string().uuid().nullable(),
  eventTypeOther: z.string().max(200).nullable(),
  eventName: z.string().min(1).max(200),
  eventPurpose: z.string().min(1).max(4000),
  eventDate: z.string().date(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  spaceId: z.string().uuid().nullable(),
  locationFreetext: z.string().max(300).nullable(),
  estimatedAttendance: z.number().int().positive().max(20000),
  departmentOrg: z.string().min(1).max(200),
  contactPhone: z.string().max(50).nullable(),

  requirements: z.object({
    foodNeeds: z.string().max(4000).optional(),
    serviceExpectations: z.string().max(4000).optional(),
    roomSetup: z.string().max(4000).optional(),
    equipment: z.string().max(4000).optional(),
    technology: z.string().max(4000).optional(),
    specialRequests: z.string().max(4000).optional(),
    dietaryRestrictions: z.string().max(4000).optional(),
  }),

  funding: z.object({
    budgetAccount: z.string().max(100).optional(),
    outsideOrgInvolved: z.boolean(),
    outsideOrgName: z.string().max(200).optional(),
    outsideFunding: z.boolean(),
    outsideFundingDetail: z.string().max(2000).optional(),
    revenueCollected: z.boolean(),
    revenueDetail: z.string().max(2000).optional(),
    revenueRecipient: z.string().max(200).optional(),
    financialRiskBearer: Party,
  }),

  answers: z.object({
    officialBusiness: YesNoUnsure,
    eventOwner: Party,
    primaryBeneficiary: Party,
    primaryPayer: Party,
    wouldOccurWithout: YesNoUnsure,
    requesterNotes: z.string().max(4000).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in to submit a request.' }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Some answers are missing or invalid.', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const b = parsed.data;

  // Look up the matrix default rather than trusting the client's copy.
  const type = b.eventTypeId
    ? await one<{ default_classification: string | null; always_review: boolean }>(
        'SELECT default_classification, always_review FROM event_types WHERE id = $1 AND is_active',
        [b.eventTypeId]
      )
    : null;

  const advisory = classify({
    typeDefault: (type?.default_classification as never) ?? null,
    typeAlwaysReview: type?.always_review ?? true,
    officialBusiness: b.answers.officialBusiness,
    eventOwner: b.answers.eventOwner,
    primaryBeneficiary: b.answers.primaryBeneficiary,
    primaryPayer: b.answers.primaryPayer,
    financialRisk: b.funding.financialRiskBearer,
    wouldOccurWithout: b.answers.wouldOccurWithout,
    outsideOrgInvolved: b.funding.outsideOrgInvolved,
    revenueCollected: b.funding.revenueCollected,
  });

  const request = await transaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO event_requests (
         requester_id, requester_name, department_org, contact_email, contact_phone,
         event_type_id, event_type_other, event_name, event_purpose, event_date,
         start_time, end_time, space_id, location_freetext, estimated_attendance,
         status, submitted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'submitted',now())
       RETURNING id, reference_code`,
      [
        user.id, user.full_name, b.departmentOrg, user.email, b.contactPhone,
        b.eventTypeId, b.eventTypeOther, b.eventName, b.eventPurpose, b.eventDate,
        b.startTime, b.endTime, b.spaceId, b.locationFreetext, b.estimatedAttendance,
      ]
    );
    const r = rows[0];

    await c.query(
      `INSERT INTO event_requirements (request_id, food_needs, service_expectations,
         room_setup, equipment, technology, special_requests, dietary_restrictions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, b.requirements.foodNeeds, b.requirements.serviceExpectations,
       b.requirements.roomSetup, b.requirements.equipment, b.requirements.technology,
       b.requirements.specialRequests, b.requirements.dietaryRestrictions]
    );

    await c.query(
      `INSERT INTO event_funding (request_id, budget_account, outside_org_name,
         outside_org_involved, outside_funding, outside_funding_detail,
         revenue_collected, revenue_detail, revenue_recipient, financial_risk_bearer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [r.id, b.funding.budgetAccount, b.funding.outsideOrgName,
       b.funding.outsideOrgInvolved, b.funding.outsideFunding, b.funding.outsideFundingDetail,
       b.funding.revenueCollected, b.funding.revenueDetail, b.funding.revenueRecipient,
       b.funding.financialRiskBearer]
    );

    await c.query(
      `INSERT INTO classification_answers (request_id, official_business, event_owner,
         primary_beneficiary, primary_payer, would_occur_without, requester_notes,
         suggested_class, suggested_rationale, deviates_from_type, deviation_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.id, b.answers.officialBusiness, b.answers.eventOwner,
       b.answers.primaryBeneficiary, b.answers.primaryPayer, b.answers.wouldOccurWithout,
       b.answers.requesterNotes, advisory.classification, advisory.rationale,
       advisory.deviatesFromType, advisory.deviationDetail ?? null]
    );

    await c.query(
      `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by)
       VALUES ($1, 'draft', 'submitted', $2)`,
      [r.id, user.id]
    );

    return r;
  });

  // Email is a nudge toward the queue, not the queue itself.
  await notifyEventsOffice(request.reference_code, b.eventName).catch(() => {});

  return NextResponse.json({
    referenceCode: request.reference_code,
    advisory: advisory.classification,
  });
}

async function notifyEventsOffice(ref: string, eventName: string) {
  if (!process.env.RESEND_API_KEY) return;
  const base = process.env.AUTH_URL ?? '';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Events & Conferences <noreply@central.edu>',
      to: process.env.EVENTS_INBOX,
      subject: `New event request ${ref} — ${eventName}`,
      text: `A new request is waiting in the queue.\n\n${base}/staff?ref=${ref}\n`,
    }),
  });
}
