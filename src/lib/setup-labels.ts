/**
 * Setup option labels and shapes.
 *
 * Kept apart from setup-options.ts because that module imports the
 * database client. A client component importing anything from it -
 * even a constant - drags the Postgres driver into the browser
 * bundle and the build fails on 'fs'.
 */

export const KIND_LABEL: Record<string, string> = {
  setup: 'Room setup',
  equipment: 'Equipment',
  technology: 'Technology',
};

export const OPTION_KINDS = ['setup', 'equipment', 'technology'] as const;

export type OptionKind = (typeof OPTION_KINDS)[number];

export interface SetupOption {
  id: string;
  kind: OptionKind;
  label: string;
  help_text: string | null;
  takes_count: boolean;
  max_count: number | null;
  sort_order: number;
}
