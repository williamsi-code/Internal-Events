import { query, one } from './db';

/**
 * Importing room bookings.
 *
 * Nothing is written until someone has seen a preview. The parse and
 * match happen first, the result is shown with every problem listed,
 * and only then does a commit write rows - all under one batch id so
 * the whole thing can be undone.
 */

export interface ImportRow {
  rowNumber: number;
  room: string;
  building: string | null;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reference: string | null;
  note: string | null;
}

export interface MatchedRow extends ImportRow {
  spaceId: string | null;
  spaceName: string | null;
  problem: string | null;
  conflictsWith: string | null;
}

export interface ImportBatch {
  id: string;
  filename: string;
  source_label: string | null;
  status: string;
  row_count: number;
  imported_count: number;
  skipped_count: number;
  imported_by_name: string | null;
  created_at: string;
  reverted_at: string | null;
  live_bookings: number;
}

export async function listImportBatches() {
  return query<ImportBatch>(
    `SELECT b.id, b.filename, b.source_label, b.status::text,
            b.row_count, b.imported_count, b.skipped_count,
            u.full_name AS imported_by_name,
            to_char(b.created_at, 'Mon FMDD, YYYY at FMHH12:MI AM') AS created_at,
            to_char(b.reverted_at, 'Mon FMDD, YYYY') AS reverted_at,
            (SELECT count(*) FROM bookings bk
              WHERE bk.import_batch_id = b.id) AS live_bookings
       FROM import_batches b
       LEFT JOIN users u ON u.id = b.imported_by
      ORDER BY b.created_at DESC
      LIMIT 50`
  );
}

/** Resolve room names and find clashes, without writing anything. */
export async function matchRows(rows: ImportRow[]): Promise<MatchedRow[]> {
  const out: MatchedRow[] = [];

  for (const r of rows) {
    let spaceId: string | null = null;
    let spaceName: string | null = null;
    let problem: string | null = null;
    let conflictsWith: string | null = null;

    if (!r.room?.trim()) {
      problem = 'No room given';
    } else if (!r.date) {
      problem = 'No date given';
    } else {
      const match = await one<{ id: string; name: string; building: string | null }>(
        `SELECT s.id, s.name, s.building
           FROM spaces s
          WHERE s.id = match_space($1, $2)`,
        [r.room, r.building]
      );

      if (!match) {
        problem = `No room matches "${r.room}"`;
      } else {
        spaceId = match.id;
        spaceName = match.building
          ? `${match.building} \u2014 ${match.name}`
          : match.name;

        // Anything already confirmed in that room at that time will
        // be refused by the database, so flag it now rather than
        // failing halfway through a commit.
        const clash = await one<{ title: string; status: string }>(
          `SELECT b.title, b.status::text
             FROM bookings b
            WHERE b.space_id = $1
              AND b.status <> 'released'
              AND tstzrange(b.starts_at, b.ends_at) && tstzrange(
                    ($2::date + $3::time) AT TIME ZONE 'America/Chicago',
                    ($2::date + $4::time) AT TIME ZONE 'America/Chicago'
                  )
            LIMIT 1`,
          [
            spaceId,
            r.date,
            r.startTime || '08:00',
            r.endTime || '17:00',
          ]
        );

        if (clash) {
          conflictsWith = `${clash.title} (${clash.status})`;
          if (clash.status === 'confirmed') {
            problem = 'Clashes with a confirmed booking';
          }
        }
      }
    }

    out.push({ ...r, spaceId, spaceName, problem, conflictsWith });
  }

  return out;
}
