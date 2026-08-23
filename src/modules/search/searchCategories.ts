/**
 * What the global search searches: one category per dex it can reach.
 *
 * Each category's `entries` is the dex's OWN list function from
 * dex/entrySources.ts, called with the same scope the dex itself is rendering
 * under. Nothing here reads species.json / moves.json / items.json /
 * abilities.json, and nothing here re-states a generation rule -- so a result can
 * only ever be something that dex is currently willing to list. See the note at
 * the top of entrySources.ts for why that is a hard rule rather than a style
 * preference.
 *
 * `moduleId` is typed as DexModuleId, the union of ids the nav registry actually
 * declares, so pointing a category at a module that is not registered is a
 * compile error rather than a click that silently lands on the Pokedex.
 */

import type { EntryScope } from '../dex/entrySources'
import { abilityEntries, itemEntries, moveEntries, speciesEntries } from '../dex/entrySources'
import type { DexModuleId } from '../nav/registry'

export interface SearchHit {
  id: number
  label: string
}

export interface SearchCategory {
  /** Stable slug used in test ids. */
  key: string
  /** Group header. */
  label: string
  /** Dex module a hit navigates to. */
  moduleId: DexModuleId
  entries: (scope: EntryScope) => SearchHit[]
}

const named = (e: { id: number; display_name: string }): SearchHit => ({
  id: e.id,
  label: e.display_name,
})

export const SEARCH_CATEGORIES: readonly SearchCategory[] = [
  {
    key: 'species',
    label: 'Species',
    moduleId: 'pokedex',
    entries: (scope) => speciesEntries(scope).map(named),
  },
  {
    key: 'moves',
    label: 'Moves',
    moduleId: 'movedex',
    entries: (scope) => moveEntries(scope).map(named),
  },
  {
    key: 'items',
    label: 'Items',
    moduleId: 'itemdex',
    entries: (scope) => itemEntries(scope).map(named),
  },
  {
    key: 'abilities',
    label: 'Abilities',
    moduleId: 'abilitydex',
    entries: (scope) => abilityEntries(scope).map(named),
  },
]

/**
 * Rows shown per group. A two-letter query matches hundreds of names, and a
 * dropdown that long is unusable; the group header reports the true total so the
 * cap is visible rather than silently truncating.
 */
export const MAX_HITS_PER_CATEGORY = 8

export interface SearchGroup {
  category: SearchCategory
  /** Up to MAX_HITS_PER_CATEGORY, best matches first. */
  hits: SearchHit[]
  /** How many matched in total, before the cap. */
  total: number
}

/** Exact name, then prefix, then anywhere -- so the cap cannot hide the obvious hit. */
function rank(label: string, term: string): number {
  const l = label.toLowerCase()
  if (l === term) return 0
  if (l.startsWith(term)) return 1
  return 2
}

/**
 * Every match for `term`, grouped by category. Groups with no match are dropped
 * here rather than rendered empty.
 */
export function searchAllDexes(
  scope: EntryScope,
  term: string,
): { groups: SearchGroup[]; total: number } {
  const needle = term.trim().toLowerCase()
  if (!needle) return { groups: [], total: 0 }

  const groups: SearchGroup[] = []
  let total = 0
  for (const category of SEARCH_CATEGORIES) {
    const matches = category
      .entries(scope)
      .filter((hit) => hit.label.toLowerCase().includes(needle))
    if (matches.length === 0) continue
    total += matches.length
    const hits = matches
      .map((hit) => ({ hit, r: rank(hit.label, needle) }))
      .sort((a, b) => a.r - b.r)
      .slice(0, MAX_HITS_PER_CATEGORY)
      .map((x) => x.hit)
    groups.push({ category, hits, total: matches.length })
  }
  return { groups, total }
}
