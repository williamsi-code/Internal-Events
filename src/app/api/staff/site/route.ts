import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * Front page content.
 *
 * Block kinds are validated here and by a check constraint on the
 * table, so a typo cannot quietly create an invisible block of kind
 * "occassion".
 */

const KINDS = [
  'news',
  'menu_spotlight',
  'staff_spotlight',
  'gallery',
  'occasion',
  'testimonial',
] as const;

const Settings = z.object({
  kind: z.literal('settings'),
  heroEyebrow: z.string().min(1).max(120),
  heroTitle: z.string().min(1).max(200),
  heroSubtitle: z.string().max(600).nullable(),
  heroMediaId: z.string().uuid().nullable(),
  introHeading: z.string().max(200).nullable(),
  introBody: z.string().max(2000).nullable(),
  contactPhone: z.string().max(60).nullable(),
  contactEmail: z.string().max(200).nullable(),
  officeHours: z.string().max(300).nullable(),
  address: z.string().max(300).nullable(),
  servicesHeading: z.string().min(1).max(120),
  servicesList: z.string().max(2000).nullable(),
  amenitiesHeading: z.string().min(1).max(120),
  amenitiesList: z.string().max(2000).nullable(),
  secondaryCtaLabel: z.string().max(80).nullable(),
  secondaryCtaUrl: z.string().max(300).nullable(),
});

const Block = z.object({
  kind: z.literal('block'),
  id: z.string().uuid().nullable(),
  blockKind: z.enum(KINDS),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).nullable(),
  body: z.string().max(4000).nullable(),
  mediaId: z.string().uuid().nullable(),
  linkUrl: z.string().max(600).nullable(),
  linkLabel: z.string().max(80).nullable(),
  menuItemId: z.string().uuid().nullable(),
  isPublished: z.boolean(),
  publishFrom: z.string().date().nullable(),
  publishTo: z.string().date().nullable(),
  sortOrder: z.number().int().min(0).max(999),
});

const Delete = z.object({
  kind: z.literal('delete'),
  id: z.string().uuid(),
});

const Body = z.discriminatedUnion('kind', [Settings, Block, Delete]);

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

  try {
    if (b.kind === 'settings') {
      await query(
        `UPDATE site_settings
            SET hero_eyebrow=$1, hero_title=$2, hero_subtitle=$3,
                hero_media_id=$4, intro_heading=$5, intro_body=$6,
                contact_phone=$7, contact_email=$8, office_hours=$9,
                address=$10, services_heading=$11, services_list=$12,
                amenities_heading=$13, amenities_list=$14,
                secondary_cta_label=$15, secondary_cta_url=$16,
                updated_at=now(), updated_by=$17
          WHERE id`,
        [
          b.heroEyebrow, b.heroTitle, b.heroSubtitle, b.heroMediaId,
          b.introHeading, b.introBody, b.contactPhone, b.contactEmail,
          b.officeHours, b.address, b.servicesHeading, b.servicesList,
          b.amenitiesHeading, b.amenitiesList, b.secondaryCtaLabel,
          b.secondaryCtaUrl, user!.id,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (b.kind === 'delete') {
      await query('DELETE FROM site_blocks WHERE id = $1', [b.id]);
      return NextResponse.json({ ok: true });
    }

    if (b.id) {
      await query(
        `UPDATE site_blocks
            SET kind=$2, title=$3, subtitle=$4, body=$5,
                media_id=$6, link_url=$7, link_label=$8, menu_item_id=$9,
                is_published=$10, publish_from=$11, publish_to=$12,
                sort_order=$13, updated_at=now(), updated_by=$14
          WHERE id=$1`,
        [
          b.id, b.blockKind, b.title, b.subtitle, b.body, b.mediaId,
          b.linkUrl, b.linkLabel, b.menuItemId, b.isPublished,
          b.publishFrom, b.publishTo, b.sortOrder, user!.id,
        ]
      );
    } else {
      await query(
        `INSERT INTO site_blocks
           (kind, title, subtitle, body, media_id, link_url, link_label,
            menu_item_id, is_published, publish_from, publish_to,
            sort_order, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          b.blockKind, b.title, b.subtitle, b.body, b.mediaId, b.linkUrl,
          b.linkLabel, b.menuItemId, b.isPublished, b.publishFrom,
          b.publishTo, b.sortOrder, user!.id,
        ]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('site content save failed:', err);
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
