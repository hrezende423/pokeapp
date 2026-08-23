/**
 * Reverse lookup: which species learn a given move.
 *
 * Reads the same per-version-group learnset partitions the Pokedex learnset card
 * uses -- no new data, and no second source that could disagree with it.
 *
 * Two shapes, because the question differs:
 *
 *   ONE GAME  rows for that version group only, one entry per species, with the
 *             methods it learns the move by and the lowest level if any.
 *   ALL       the union across all fourteen groups, DEDUPLICATED BY SPECIES rather
 *             than one row per game, since "which species can learn this at all in
 *             Gen 1-4" is the question. Each entry records which games and methods
 *             contributed, so the dedup never hides that a species only learns it
 *             in one obscure version group.
 *
 * Rows are per (pokemon, move, method, level), so a multi-form species contributes
 * several rows; they collapse onto the species, and non-default forms are named.
 */

import { getSpecies } from './loader'
import type { LearnRow, Species } from './types'

export interface MoveLearner {
  species: Species
  /** Learn methods, in the display order of METHOD_ORDER-style sorting. */
  methods: string[]
  /** Lowest level-up level across contributing rows, or null if never by level. */
  level: number | null
  /** Version groups that contribute, empty when the caller asked for just one. */
  versionGroups: string[]
  /** Non-default form names that learn it, when the default form does not. */
  forms: string[]
}

interface Accumulator {
  species: Species
  methods: Set<string>
  level: number | null
  versionGroups: Set<string>
  defaultForm: boolean
  forms: Set<string>
}

/** Method display order, matching the Pokedex learnset card. */
const METHOD_ORDER = ['level-up', 'machine', 'egg', 'tutor']

function sortMethods(methods: Iterable<string>): string[] {
  const list = [...methods]
  return [
    ...METHOD_ORDER.filter((m) => list.includes(m)),
    ...list.filter((m) => !METHOD_ORDER.includes(m)).sort(),
  ]
}

function accumulate(
  into: Map<number, Accumulator>,
  rows: LearnRow[],
  moveId: number,
  versionGroup: string | null,
) {
  for (const row of rows) {
    if (row.move_id !== moveId) continue
    const species = getSpecies(row.species_id)
    if (!species) continue

    let acc = into.get(row.species_id)
    if (!acc) {
      acc = {
        species,
        methods: new Set(),
        level: null,
        versionGroups: new Set(),
        defaultForm: false,
        forms: new Set(),
      }
      into.set(row.species_id, acc)
    }
    acc.methods.add(row.method)
    if (row.method === 'level-up' && row.level > 0) {
      acc.level = acc.level == null ? row.level : Math.min(acc.level, row.level)
    }
    if (versionGroup) acc.versionGroups.add(versionGroup)

    const variety = species.varieties.find((v) => v.pokemon_id === row.pokemon_id)
    if (!variety || variety.is_default) acc.defaultForm = true
    else acc.forms.add(variety.name)
  }
}

function finalise(acc: Map<number, Accumulator>): MoveLearner[] {
  return [...acc.values()]
    .sort((a, b) => a.species.id - b.species.id)
    .map((a) => ({
      species: a.species,
      methods: sortMethods(a.methods),
      level: a.level,
      versionGroups: [...a.versionGroups],
      forms: a.defaultForm ? [] : [...a.forms],
    }))
}

/** Species that learn `moveId` in one version group, in national dex order. */
export function learnersInVersionGroup(rows: LearnRow[], moveId: number): MoveLearner[] {
  const acc = new Map<number, Accumulator>()
  accumulate(acc, rows, moveId, null)
  return finalise(acc)
}

/**
 * Species that learn `moveId` in ANY of the supplied version groups, one entry per
 * species. `versionGroups` on each entry says which games contributed.
 */
export function learnersAcrossVersionGroups(
  partitions: { versionGroup: string; rows: LearnRow[] }[],
  moveId: number,
): MoveLearner[] {
  const acc = new Map<number, Accumulator>()
  for (const p of partitions) accumulate(acc, p.rows, moveId, p.versionGroup)
  return finalise(acc)
}
