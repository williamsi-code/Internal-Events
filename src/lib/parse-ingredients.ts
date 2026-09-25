/**
 * Reading a pasted ingredient list.
 *
 * Typing three fields per line for several hundred recipes is the
 * difference between a project that happens and one that does not.
 * Most recipes already exist somewhere as text, so the fastest route
 * in is to paste them and correct what we get wrong.
 *
 * This is deliberately forgiving. A line it cannot read becomes a
 * row with the text in the name, which the person fixes - better
 * than dropping it silently.
 *
 * No server imports: the editor parses as they paste, so the result
 * is visible before anything is sent.
 */

export interface ParsedLine {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  preparation: string | null;
  confident: boolean;
}

/** Unit words as they appear in real recipes, mapped to our codes. */
const UNIT_WORDS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', '#': 'lb',

  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml',
  milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', t: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tbs: 'tbsp', T: 'tbsp',
  floz: 'floz', 'fl oz': 'floz', 'fluid ounce': 'floz',
  'fluid ounces': 'floz',
  cup: 'cup', cups: 'cup', c: 'cup',
  pt: 'pt', pint: 'pt', pints: 'pt',
  qt: 'qt', quart: 'qt', quarts: 'qt',
  gal: 'gal', gallon: 'gal', gallons: 'gal',

  each: 'each', ea: 'each', piece: 'each', pieces: 'each',
  dozen: 'dozen', doz: 'dozen',
  case: 'case', cases: 'case',
  bunch: 'bunch', bunches: 'bunch',
};

/** Vulgar fractions, because recipes are full of them. */
const FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

function readQuantity(text: string): { value: number; rest: string } | null {
  let s = text.trim();

  // A leading vulgar fraction, possibly after a whole number.
  const vulgar = s.match(/^(\d+)?\s*([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*(.*)$/);
  if (vulgar) {
    const whole = vulgar[1] ? Number(vulgar[1]) : 0;
    return { value: whole + FRACTIONS[vulgar[2]], rest: vulgar[3] };
  }

  // "1 1/2", "1-1/2"
  const mixed = s.match(/^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (mixed) {
    return {
      value: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]),
      rest: mixed[4],
    };
  }

  // "3/4"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (frac) {
    return { value: Number(frac[1]) / Number(frac[2]), rest: frac[3] };
  }

  // "2", "2.5", and ranges like "2-3" where we take the larger, since
  // running out is worse than having spare.
  const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (range) {
    return { value: Number(range[2]), rest: range[3] };
  }

  const plain = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (plain) {
    return { value: Number(plain[1]), rest: plain[2] };
  }

  return null;
}

function readUnit(text: string): { code: string; rest: string } | null {
  const s = text.trim();

  // Two-word units first, or "fl oz" becomes "fl" plus a mystery.
  const two = s.match(/^(fl\.?\s*oz|fluid\s+ounces?)\s*\.?\s*(.*)$/i);
  if (two) return { code: 'floz', rest: two[2] };

  const one = s.match(/^([a-zA-Z#]+)\.?\s*(.*)$/);
  if (!one) return null;

  const word = one[1];
  // Case matters for exactly two of these: T is tablespoon, t is
  // teaspoon. Everything else is looked up lowercase.
  const code = UNIT_WORDS[word] ?? UNIT_WORDS[word.toLowerCase()];
  if (!code) return null;

  return { code, rest: one[2] };
}

export function parseIngredientLine(raw: string): ParsedLine {
  const line = raw.trim().replace(/^[-*•·]\s*/, '');

  if (!line) {
    return {
      raw,
      quantity: null,
      unit: null,
      name: '',
      preparation: null,
      confident: false,
    };
  }

  const qty = readQuantity(line);
  if (!qty) {
    // No number at all: "salt and pepper to taste". Keep it as a name
    // and let them decide.
    return {
      raw,
      quantity: null,
      unit: null,
      name: line,
      preparation: null,
      confident: false,
    };
  }

  const unit = readUnit(qty.rest);
  let remainder = unit ? unit.rest : qty.rest;

  // Anything after a comma is how it is prepared, not what it is.
  // "onions, finely diced" is onions.
  let preparation: string | null = null;
  const comma = remainder.indexOf(',');
  if (comma >= 0) {
    preparation = remainder.slice(comma + 1).trim() || null;
    remainder = remainder.slice(0, comma);
  }

  // Bracketed notes are preparation too.
  const bracket = remainder.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (bracket) {
    preparation = [preparation, bracket[2]].filter(Boolean).join(', ');
    remainder = bracket[1];
  }

  const name = remainder.trim().replace(/\s+/g, ' ');

  return {
    raw,
    quantity: qty.value,
    unit: unit?.code ?? null,
    name,
    preparation,
    // Confident means: a number, a unit we recognise, and something
    // left over to call an ingredient.
    confident: !!unit && name.length > 1,
  };
}

export function parseIngredientList(text: string): ParsedLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}

/** Match a parsed name against the ingredients we already have.
 *  Exact first, then contained, then nothing. */
export function matchIngredient<T extends { id: string; name: string }>(
  parsedName: string,
  ingredients: T[]
): T | null {
  if (!parsedName) return null;
  const n = parsedName.toLowerCase().trim();

  const exact = ingredients.find((i) => i.name.toLowerCase() === n);
  if (exact) return exact;

  // Singular and plural, cheaply.
  const singular = n.replace(/(e?s)$/, '');
  const near = ingredients.find(
    (i) =>
      i.name.toLowerCase() === singular ||
      i.name.toLowerCase() === `${n}s` ||
      i.name.toLowerCase() === `${n}es`
  );
  if (near) return near;

  const contained = ingredients.filter(
    (i) =>
      i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase())
  );
  // Only when it is unambiguous. Two candidates means a person picks.
  return contained.length === 1 ? contained[0] : null;
}
