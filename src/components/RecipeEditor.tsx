'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  parseIngredientList,
  matchIngredient,
  type ParsedLine,
} from '@/lib/parse-ingredients';
import type {
  Recipe,
  RecipeComponent,
  RecipeStep,
  IngredientOption,
  UnitOption,
  MenuItemOption,
} from '@/lib/recipes';

/**
 * Writing a recipe down.
 *
 * Several hundred of these have to be entered, so the editor is
 * built around speed rather than ceremony: paste the ingredient list
 * and correct what it gets wrong, rather than filling in three
 * fields per line.
 */

interface Row {
  key: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  newName: string | null;
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
  isOptional: boolean;
  /** Parsed but not matched to anything we know. */
  unmatched: boolean;
}

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

export default function RecipeEditor({
  recipe,
  components,
  steps,
  ingredients,
  units,
  menuItems,
  subRecipes,
}: {
  recipe: Recipe | null;
  components: RecipeComponent[];
  steps: RecipeStep[];
  ingredients: IngredientOption[];
  units: UnitOption[];
  menuItems: MenuItemOption[];
  subRecipes: { id: string; name: string; yield_quantity: string; yield_unit: string }[];
}) {
  const router = useRouter();

  const [name, setName] = useState(recipe?.name ?? '');
  const [menuItemId, setMenuItemId] = useState(recipe?.menu_item_id ?? '');
  const [yieldQty, setYieldQty] = useState(recipe?.yield_quantity ?? '1');
  const [yieldUnit, setYieldUnit] = useState(recipe?.yield_unit ?? 'each');
  const [serves, setServes] = useState(
    recipe?.serves ? String(recipe.serves) : ''
  );
  const [prep, setPrep] = useState(
    recipe?.prep_minutes ? String(recipe.prep_minutes) : ''
  );
  const [cook, setCook] = useState(
    recipe?.cook_minutes ? String(recipe.cook_minutes) : ''
  );
  const [method, setMethod] = useState(recipe?.method ?? '');
  const [chefNotes, setChefNotes] = useState(recipe?.chef_notes ?? '');
  const [scaleNotes, setScaleNotes] = useState(recipe?.scale_notes ?? '');

  const [rows, setRows] = useState<Row[]>(
    components.map((c) => ({
      key: newKey(),
      ingredientId: c.ingredient_id,
      subRecipeId: c.sub_recipe_id,
      newName: null,
      name: c.name,
      quantity: String(Number(c.quantity)),
      unit: c.unit,
      preparation: c.preparation ?? '',
      isOptional: c.is_optional,
      unmatched: false,
    }))
  );

  const [stepRows, setStepRows] = useState(
    steps.map((s) => ({
      key: newKey(),
      instruction: s.instruction,
      minutes: s.minutes ? String(s.minutes) : '',
      station: s.station ?? '',
    }))
  );

  const [paste, setPaste] = useState('');
  const [pasting, setPasting] = useState(components.length === 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState<string | null>(recipe?.cost ?? null);

  /* ---------- pasting ---------- */

  function applyPaste() {
    const parsed: ParsedLine[] = parseIngredientList(paste);
    if (parsed.length === 0) return;

    const added: Row[] = parsed.map((p) => {
      const match = matchIngredient(p.name, ingredients);
      return {
        key: newKey(),
        ingredientId: match?.id ?? null,
        subRecipeId: null,
        newName: match ? null : p.name || null,
        name: match?.name ?? p.name,
        quantity: p.quantity ? String(Number(p.quantity.toFixed(4))) : '',
        unit: p.unit ?? match?.base_unit ?? 'each',
        preparation: p.preparation ?? '',
        isOptional: false,
        unmatched: !match,
      };
    });

    setRows((r) => [...r, ...added]);
    setPaste('');
    setPasting(false);
  }

  /* ---------- rows ---------- */

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const removeRow = (key: string) =>
    setRows((r) => r.filter((x) => x.key !== key));

  function addRow() {
    setRows((r) => [
      ...r,
      {
        key: newKey(),
        ingredientId: null,
        subRecipeId: null,
        newName: null,
        name: '',
        quantity: '',
        unit: 'g',
        preparation: '',
        isOptional: false,
        unmatched: false,
      },
    ]);
  }

  function pickIngredient(key: string, value: string) {
    if (value.startsWith('sub:')) {
      const sub = subRecipes.find((s) => s.id === value.slice(4));
      setRow(key, {
        subRecipeId: sub?.id ?? null,
        ingredientId: null,
        newName: null,
        name: sub?.name ?? '',
        unit: sub?.yield_unit ?? 'each',
        unmatched: false,
      });
      return;
    }
    const ing = ingredients.find((i) => i.id === value);
    setRow(key, {
      ingredientId: ing?.id ?? null,
      subRecipeId: null,
      newName: null,
      name: ing?.name ?? '',
      unmatched: false,
    });
  }

  const unmatchedCount = rows.filter(
    (r) => !r.ingredientId && !r.subRecipeId && r.name.trim()
  ).length;

  const allergens = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      for (const a of ing?.allergens ?? []) set.add(a);
    }
    return [...set].sort();
  }, [rows, ingredients]);

  /* ---------- saving ---------- */

  async function save() {
    if (!name.trim()) {
      setError('Give the recipe a name.');
      return;
    }
    const usable = rows.filter((r) => r.name.trim() && Number(r.quantity) > 0);
    if (usable.length === 0) {
      setError('A recipe needs at least one ingredient with a quantity.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/staff/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          id: recipe?.id ?? null,
          name: name.trim(),
          menuItemId: menuItemId || null,
          yieldQuantity: Number(yieldQty) || 1,
          yieldUnit,
          serves: Number(serves) || null,
          prepMinutes: Number(prep) || null,
          cookMinutes: Number(cook) || null,
          restMinutes: null,
          method: method.trim() || null,
          chefNotes: chefNotes.trim() || null,
          scaleNotes: scaleNotes.trim() || null,
          isActive: true,
          components: usable.map((r) => ({
            ingredientId: r.ingredientId,
            subRecipeId: r.subRecipeId,
            newIngredientName:
              !r.ingredientId && !r.subRecipeId ? r.name.trim() : null,
            newIngredientUnit: r.unit,
            quantity: Number(r.quantity),
            unit: r.unit,
            preparation: r.preparation.trim() || null,
            isOptional: r.isOptional,
          })),
          steps: stepRows
            .filter((s) => s.instruction.trim())
            .map((s) => ({
              instruction: s.instruction.trim(),
              minutes: Number(s.minutes) || null,
              station: s.station.trim() || null,
            })),
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not save.');
        setBusy(false);
        return;
      }

      setCost(d.cost);
      if (!recipe) {
        router.push(`/staff/manage/recipes/${d.id}`);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  const money = (v: string | null) =>
    v === null
      ? null
      : Number(v).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        });

  const perServing =
    cost && Number(serves) > 0
      ? money(String(Number(cost) / Number(serves)))
      : null;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-editor">
        <div className="grid two">
          <div className="field">
            <label htmlFor="rc-name">Recipe name</label>
            <input
              id="rc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rc-menu">Menu item</label>
            <p className="sub">
              Leave blank for a component made once and used in several
              dishes, like a sauce or a stock.
            </p>
            <select
              id="rc-menu"
              value={menuItemId}
              onChange={(e) => setMenuItemId(e.target.value)}
            >
              <option value="">Not a menu item on its own</option>
              {menuItems.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.category} {'\u2014'} {m.name}
                  {m.has_recipe && m.id !== recipe?.menu_item_id
                    ? ' (has a recipe)'
                    : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid two">
          <div className="field">
            <label htmlFor="rc-yield">One batch makes</label>
            <div className="yield-row">
              <input
                id="rc-yield"
                type="number"
                step="0.1"
                min={0}
                value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)}
              />
              <select
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value)}
                aria-label="Yield unit"
              >
                {units.map((u) => (
                  <option value={u.code} key={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="rc-serves">Serves</label>
            <p className="sub">People per batch. Used to scale an order.</p>
            <input
              id="rc-serves"
              type="number"
              min={1}
              value={serves}
              onChange={(e) => setServes(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rc-prep">Prep minutes</label>
            <input
              id="rc-prep"
              type="number"
              min={0}
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rc-cook">Cook minutes</label>
            <input
              id="rc-cook"
              type="number"
              min={0}
              value={cook}
              onChange={(e) => setCook(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ---------- ingredients ---------- */}
      <div className="admin-editor">
        <div className="booking-head">
          <div>
            <h3>Ingredients</h3>
            {cost && (
              <p className="sub">
                {money(cost)} a batch
                {perServing ? ` \u00b7 ${perServing} a serving` : ''}
              </p>
            )}
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setPasting((v) => !v)}
            >
              {pasting ? 'Type them instead' : 'Paste a list'}
            </button>
          </div>
        </div>

        {pasting && (
          <div className="paste-box">
            <div className="field">
              <label htmlFor="rc-paste">Paste the ingredient list</label>
              <p className="sub">
                One per line, however it is written. &ldquo;2 cups flour&rdquo;,
                &ldquo;1 1/2 lb chicken, diced&rdquo;, &ldquo;&frac12; tsp
                salt&rdquo;. We will read what we can and you correct the rest.
              </p>
              <textarea
                id="rc-paste"
                rows={8}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={
                  '2 cups all-purpose flour\n1 1/2 lb chicken breast, diced\n\u00bd tsp salt\n4 fl oz white wine'
                }
              />
            </div>
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={applyPaste}
                disabled={!paste.trim()}
              >
                Read the list
              </button>
              {rows.length > 0 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setPasting(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {unmatchedCount > 0 && (
          <div className="callout c-warn">
            <strong>
              {unmatchedCount} ingredient
              {unmatchedCount === 1 ? '' : 's'} we do not have yet
            </strong>
            They will be created when you save. Check the unit on each one
            first, since it is how that ingredient gets counted from then on.
          </div>
        )}

        {rows.length > 0 && (
          <div className="ing-rows">
            {rows.map((r) => (
              <div
                className={`ing-row${r.unmatched && !r.ingredientId ? ' new' : ''}`}
                key={r.key}
              >
                <input
                  className="ing-qty"
                  type="number"
                  step="0.001"
                  min={0}
                  value={r.quantity}
                  placeholder="0"
                  onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                  aria-label="Quantity"
                />

                <select
                  className="ing-unit"
                  value={r.unit}
                  onChange={(e) => setRow(r.key, { unit: e.target.value })}
                  aria-label="Unit"
                >
                  {units.map((u) => (
                    <option value={u.code} key={u.code}>
                      {u.code}
                    </option>
                  ))}
                </select>

                {r.ingredientId || r.subRecipeId ? (
                  <select
                    className="ing-name"
                    value={
                      r.subRecipeId ? `sub:${r.subRecipeId}` : (r.ingredientId ?? '')
                    }
                    onChange={(e) => pickIngredient(r.key, e.target.value)}
                    aria-label="Ingredient"
                  >
                    <optgroup label="Ingredients">
                      {ingredients.map((i) => (
                        <option value={i.id} key={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
                    {subRecipes.length > 0 && (
                      <optgroup label="Made in-house">
                        {subRecipes.map((s) => (
                          <option value={`sub:${s.id}`} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                ) : (
                  <input
                    className="ing-name"
                    type="text"
                    value={r.name}
                    placeholder="Ingredient"
                    list="known-ingredients"
                    onChange={(e) => {
                      const v = e.target.value;
                      const match = ingredients.find(
                        (i) => i.name.toLowerCase() === v.toLowerCase()
                      );
                      setRow(r.key, {
                        name: v,
                        ingredientId: match?.id ?? null,
                        unmatched: !match,
                      });
                    }}
                    aria-label="Ingredient"
                  />
                )}

                <input
                  className="ing-prep"
                  type="text"
                  value={r.preparation}
                  placeholder="diced, room temp"
                  onChange={(e) =>
                    setRow(r.key, { preparation: e.target.value })
                  }
                  aria-label="Preparation"
                />

                <button
                  className="ing-remove"
                  onClick={() => removeRow(r.key)}
                  aria-label={`Remove ${r.name || 'this line'}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <datalist id="known-ingredients">
          {ingredients.map((i) => (
            <option value={i.name} key={i.id} />
          ))}
        </datalist>

        <div className="actions">
          <button className="btn btn-ghost" onClick={addRow}>
            Add a line
          </button>
        </div>

        {allergens.length > 0 && (
          <p className="sub">
            <strong>Allergens from the ingredients:</strong>{' '}
            {allergens.join(', ')}
          </p>
        )}
      </div>

      {/* ---------- method ---------- */}
      <div className="admin-editor">
        <h3>Method</h3>
        <p className="sub">
          Write it however the kitchen writes it. Numbered steps are useful for
          production timing, but prose is better than nothing.
        </p>
        <textarea
          rows={8}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />

        <div className="grid two">
          <div className="field">
            <label htmlFor="rc-chef">Chef notes</label>
            <p className="sub">What goes wrong, and what to do about it.</p>
            <textarea
              id="rc-chef"
              rows={3}
              value={chefNotes}
              onChange={(e) => setChefNotes(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rc-scale">At scale</label>
            <p className="sub">
              What changes for 200 that does not for 20. Which oven, how many
              pans, what cannot be doubled.
            </p>
            <textarea
              id="rc-scale"
              rows={3}
              value={scaleNotes}
              onChange={(e) => setScaleNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="actions sticky-save">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : recipe ? 'Save the recipe' : 'Create the recipe'}
        </button>
        <Link href="/staff/manage/recipes" className="btn btn-ghost">
          {recipe ? 'Back to recipes' : 'Cancel'}
        </Link>
        {cost && (
          <span className="save-cost">
            {money(cost)} a batch
            {perServing ? ` \u00b7 ${perServing} a serving` : ''}
          </span>
        )}
      </div>
    </>
  );
}
