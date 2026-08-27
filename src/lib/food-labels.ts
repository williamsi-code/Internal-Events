/**
 * Display labels for food sources.
 *
 * Kept apart from food-sources.ts deliberately: that module imports
 * the database client, and a client component importing a value from
 * it would pull the Postgres driver into the browser bundle.
 * Types can cross that line with `import type`; values cannot.
 */

export const FOOD_SOURCE_LABEL: Record<string, string> = {
  central_dining: 'Central Dining',
  outside_caterer: 'Outside caterer',
  donated: 'Donated food',
  no_food: 'No food',
};