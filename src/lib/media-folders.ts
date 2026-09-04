/**
 * Folder names for the image library.
 *
 * Kept apart from media.ts because that module imports the database
 * client, and a client component importing a value from it would pull
 * the Postgres driver into the browser bundle.
 */

export const MEDIA_FOLDERS = [
  ['food', 'Food'],
  ['staff', 'Staff'],
  ['events', 'Events'],
  ['graham', 'Graham Conference Center'],
  ['maytag', 'Maytag Student Center'],
  ['chapel', 'Chapel'],
  ['other', 'Other'],
] as const;

export const FOLDER_LABEL: Record<string, string> = Object.fromEntries(
  MEDIA_FOLDERS.map(([k, v]) => [k, v])
);
