'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { RecipeSummary } from '@/lib/recipes';

export default function RecipeList({
  recipes,
}: {
  recipes: RecipeSummary[];
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const counts = useMemo(
    () => ({
      all: recipes.filter((r) => r.is_active).length,
      dishes: recipes.filter((r) => r.is_active && !r.is_sub_recipe).length,
      components: recipes.filter((r) => r.is_active && r.is_sub_recipe).length,
      uncosted: recipes.filter((r) => r.is_active && !r.cost).length,
    }),
    [recipes]
  );

  const shown = recipes.filter((r) => {
    if (!r.is_active) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (filter === 'dishes') return !r.is_sub_recipe;
    if (filter === 'components') return r.is_sub_recipe;
    if (filter === 'uncosted') return !r.cost;
    return true;
  });

  const money = (v: string | null) =>
    v === null
      ? null
      : Number(v).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        });

  const byCategory = useMemo(() => {
    const map = new Map<string, RecipeSummary[]>();
    for (const r of shown) {
      const key = r.is_sub_recipe
        ? 'Made in-house'
        : (r.category ?? 'Uncategorised');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <>
      <div className="admin-bar">
        <input
          type="search"
          placeholder="Find a recipe"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 'auto', minWidth: '14rem' }}
          aria-label="Find a recipe"
        />
      </div>

      <div className="filters" role="group" aria-label="Filter recipes">
        {(
          [
            ['all', 'Everything'],
            ['dishes', 'Menu items'],
            ['components', 'Made in-house'],
            ['uncosted', 'No cost yet'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="chip"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} <span className="n">{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty" style={{ padding: '2rem 0' }}>
          {recipes.length === 0
            ? 'No recipes yet. The first one is the slowest.'
            : 'Nothing matches.'}
        </p>
      ) : (
        byCategory.map(([category, list]) => (
          <section className="recipe-group" key={category}>
            <h2 className="bo-heading">{category}</h2>
            <div className="recipe-list">
              {list.map((r) => (
                <Link
                  href={`/staff/manage/recipes/${r.id}`}
                  className="recipe-row"
                  key={r.id}
                >
                  <div className="recipe-main">
                    <span className="recipe-name">{r.name}</span>
                    <span className="recipe-meta">
                      Makes {Number(r.yield_quantity)} {r.yield_unit}
                      {r.serves ? ` \u00b7 serves ${r.serves}` : ''}
                      {r.component_count
                        ? ` \u00b7 ${r.component_count} ingredient${
                            r.component_count === 1 ? '' : 's'
                          }`
                        : ' \u00b7 no ingredients yet'}
                      {r.used_by > 0
                        ? ` \u00b7 used in ${r.used_by} recipe${
                            r.used_by === 1 ? '' : 's'
                          }`
                        : ''}
                    </span>
                  </div>
                  <div className="recipe-figures">
                    {r.cost ? (
                      <>
                        <span className="recipe-cost">{money(r.cost)}</span>
                        {r.cost_per_serving && (
                          <span className="recipe-per">
                            {money(r.cost_per_serving)} a serving
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="pill p-review">Not costed</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
