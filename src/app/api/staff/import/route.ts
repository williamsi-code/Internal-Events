import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { one, transaction } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { matchRows, type ImportRow } from '@/lib/imports';

/**
 * Preview and commit a booking import.
 *
 * The spreadsheet is parsed in the browser, so a large file never
 * crosses the network and there is no upload size limit to hit. What
 * arrives here is already rows.
 */

const Row = z.object({
  rowNumber: z.number().int(),
  room: z.string().max(200),
  building: z.string().max(200).nullable(),
  title: z.string().max(300),
  date: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  reference: z.string().max(120).nullable(),
  note: z.string().max(500).nullable(),
});

const Preview = z.object({
  action: z.literal('preview'),
  rows: z.array(Row).max(2000),
});

const Commit = z.object({
  action: z.literal('commit'),
  filename: z.string().max(300),
  sourceLabel: z.string().max(120).nullable(),
  rows: z.array(Row).max(2000),
  skipConflicts: z.boolean(),
});

const Revert = z.object({
  action: z.literal('revert'),
  batchId: z.string().uuid(),
});

const Body = z.discriminatedUnion('action', [Preview, Commit, Revert]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const isStaff =
    user?.roles.includes('events_staff') || user?.roles.includes('admin');
  if (!isStaff) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Could not read those rows.' },
      { status: 400 }
    );
  }
  const b = parsed.data;

  try {
    if (b.action === 'preview') {
      const matched = await matchRows(b.rows as ImportRow[]);
      return NextResponse.json({ rows: matched });
    }

    if (b.action === 'revert') {
      const result = await one<{ revert_import: number }>(
        'SELECT revert_import($1, $2)',
        [b.batchId, user!.id]
      );
      return NextResponse.json({
        ok: true,
        removed: result?.revert_import ?? 0,
      });
    }

    /* ---------- commit ---------- */
    const matched = await matchRows(b.rows as ImportRow[]);

    const usable = matched.filter((r) => {
      if (!r.spaceId) return false;
      if (r.problem) return false;
      if (b.skipConflicts && r.conflictsWith) return false;
      return true;
    });

    const batch = await transaction(async (c) => {
      const { rows: batchRows } = await c.query(
        `INSERT INTO import_batches
           (filename, source_label, status, row_count, imported_count,
            skipped_count, imported_by)
         VALUES ($1,$2,'committed',$3,$4,$5,$6)
         RETURNING id`,
        [
          b.filename,
          b.sourceLabel,
          matched.length,
          usable.length,
          matched.length - usable.length,
          user!.id,
        ]
      );
      const batchId = batchRows[0].id;

      for (const r of usable) {
        await c.query(
          `INSERT INTO bookings (
             space_id, starts_at, ends_at, event_starts_at, event_ends_at,
             status, title, note, is_blackout,
             setup_minutes, teardown_minutes,
             import_batch_id, external_ref, source_label, created_by
           ) VALUES (
             $1,
             ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
             ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
             ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
             ($2::date + $4::time) AT TIME ZONE 'America/Chicago',
             'tentative', $5, $6, false, 0, 0, $7, $8, $9, $10
           )`,
          [
            r.spaceId,
            r.date,
            r.startTime || '08:00',
            r.endTime || '17:00',
            r.title || 'Imported booking',
            r.note,
            batchId,
            r.reference,
            b.sourceLabel,
            user!.id,
          ]
        );
      }

      return batchId;
    });

    return NextResponse.json({
      ok: true,
      batchId: batch,
      imported: usable.length,
      skipped: matched.length - usable.length,
    });
  } catch (err) {
    console.error('import failed:', err);
    return NextResponse.json(
      { error: 'Import failed. Nothing was written.' },
      { status: 500 }
    );
  }
}
