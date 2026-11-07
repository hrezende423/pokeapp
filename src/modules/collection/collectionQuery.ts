/**
 * Search, filter and sort for the Collection, declared as the same config the
 * dexes and the Team Builder's libraries use (dex/query/dexQuery.ts), so it opens
 * from the app bar's Search/Filter and Sort menus like every other list.
 *
 * THE ROWS ARE THE APP GENERATION'S ENTRIES ONLY. The Collection follows the
 * global selector (it is not one of the four exceptions), so another
 * generation's entries are not rows at all -- not filtered-out rows.
 *
 * A ROW CARRIES ITS CANDIDATE, computed once per document change: the Fits filter
 * and the list's Fits column read the same answer.
 */

import { getSpecies } from '../../data'
import type { FilterSection, SortField } from '../dex/query/dexQuery'
import {
  ACQUIRE_METHODS,
  orderedBuilds,
  type CollectionEntry,
  type Pokerus,
  type TeamBuilderData,
} from '../team-builder/model'
import { isShinyByDvs } from '../team-builder/statMath'
import { bestCandidate, type BestCandidate } from './candidates'

export interface CollectionRow {
  entry: CollectionEntry
  /** Position among the generation's entries, in the order they were added. */
  index: number
  /** Nickname, else species. */
  name: string
  speciesName: string
  speciesId: number
  otName: string
  otId: string
  method: string | null
  pokerus: Pokerus
  /** Gen 2: from the DVs; Gen 3+: stored; Gen 1: none. */
  shiny: boolean
  candidate: BestCandidate | null
}

export function collectionRows(data: TeamBuilderData, generation: number): CollectionRow[] {
  const builds = orderedBuilds(data).filter((b) => b.generation === generation)
  return (data.collection ?? [])
    .filter((c) => c.generation === generation)
    .sort((a, b) => a.seq - b.seq)
    .map((entry, index) => {
      const species = getSpecies(entry.speciesId)
      const speciesName = species?.display_name ?? `#${entry.speciesId}`
      return {
        entry,
        index,
        name: entry.nickname.trim() || speciesName,
        speciesName,
        speciesId: entry.speciesId,
        otName: entry.ot.name,
        otId: entry.ot.id,
        method: entry.acquired.method,
        pokerus: entry.pokerus,
        shiny: generation >= 3 ? entry.shiny : generation === 2 && isShinyByDvs(entry.individual),
        candidate: bestCandidate(entry, builds),
      }
    })
}

export const POKERUS_OPTIONS: { value: Pokerus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'infected', label: 'Infected' },
  { value: 'cured', label: 'Cured' },
]

export function collectionFilterSections(
  rows: CollectionRow[],
  generation: number,
): FilterSection<CollectionRow>[] {
  const methods = new Set(rows.map((r) => r.method))
  const pokerus = new Set(rows.map((r) => r.pokerus))
  return [
    {
      id: 'name',
      label: 'Name',
      filters: [
        {
          kind: 'text',
          key: 'name',
          label: 'Search by nickname, species or OT',
          testId: 'col-search',
          match: (r, term) =>
            r.entry.nickname.toLowerCase().includes(term) ||
            r.speciesName.toLowerCase().includes(term) ||
            r.otName.toLowerCase().includes(term) ||
            r.otId.toLowerCase().includes(term),
        },
        {
          kind: 'select',
          key: 'fits',
          label: 'Fits',
          anyLabel: 'Any',
          options: [
            { value: 'fits', label: 'Fits a Build' },
            { value: 'exact', label: 'Exact' },
          ],
          match: (r, v) => (v === 'exact' ? r.candidate?.kind === 'exact' : r.candidate != null),
        },
      ],
    },
    {
      id: 'record',
      label: 'Record',
      filters: [
        {
          kind: 'multi',
          key: 'method',
          label: 'Method',
          // Read off the entries in scope, in the list's own order.
          options: ACQUIRE_METHODS.filter((m) => methods.has(m.value)).map((m) => ({
            value: m.value,
            label: m.label,
          })),
          match: (r, selected) => r.method != null && selected.includes(r.method),
        },
        {
          kind: 'multi',
          key: 'pokerus',
          label: 'Pokérus',
          // Gen 1 has no Pokérus.
          hidden: generation <= 1,
          options: POKERUS_OPTIONS.filter((o) => pokerus.has(o.value)),
          match: (r, selected) => selected.includes(r.pokerus),
        },
        {
          kind: 'select',
          key: 'shiny',
          label: 'Shiny',
          anyLabel: 'Any',
          // Gen 1 has no shinies.
          hidden: generation <= 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
          match: (r, v) => r.shiny === (v === 'yes'),
        },
      ],
    },
  ]
}

export function collectionSortFields(): SortField<CollectionRow>[] {
  return [
    { key: 'order', label: 'Collection order', value: (r) => r.index },
    { key: 'name', label: 'Nickname', value: (r) => r.name },
    { key: 'species', label: 'Species (dex #)', value: (r) => r.speciesId },
    { key: 'level', label: 'Level', value: (r) => r.entry.level },
    { key: 'acquired', label: 'Acquired date', value: (r) => r.entry.acquired.date || null },
  ]
}
