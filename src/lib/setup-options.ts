import { query } from './db';
import type { SetupOption } from './setup-labels';

/**
 * Setup, equipment and technology.
 *
 * What a room can do is per room; what a request asked for is a set
 * of picks against that list. Free text remains for the things no
 * checklist anticipates, but the common cases are now countable.
 *
 * The labels and types live in setup-labels.ts so client components
 * can use them without importing this file.
 */

export async function getOptionsForSpace(spaceId: string) {
  return query<SetupOption>('SELECT * FROM options_for_space($1)', [spaceId]);
}

/** Every option, for the back office. */
export async function listAllOptions() {
  return query<SetupOption>(
    `SELECT id, kind::text, label, help_text, takes_count,
            null::integer AS max_count, sort_order
       FROM setup_options
      WHERE is_active
      ORDER BY kind, sort_order`
  );
}

/** Which options a room offers, for the back office. */
export async function getSpaceOptionIds(spaceId: string) {
  const rows = await query<{ option_id: string }>(
    'SELECT option_id FROM space_setup_options WHERE space_id = $1',
    [spaceId]
  );
  return rows.map((r) => r.option_id);
}

export interface RequestSetup {
  kind: string;
  label: string;
  count: number | null;
  note: string | null;
}

export async function getSetupForRequest(requestId: string) {
  return query<RequestSetup>('SELECT * FROM setup_for_request($1)', [
    requestId,
  ]);
}

export async function getSelectedOptions(requestId: string) {
  return query<{ option_id: string; count: number | null }>(
    'SELECT option_id, count FROM request_setup_selections WHERE request_id = $1',
    [requestId]
  );
}
