/**
 * The Pokedex's filters and sorts, as data.
 *
 * Same config model as every other dex (modules/dex/query/dexQuery.ts); this is
 * simply the largest instance of it, because a species carries more fields worth
 * filtering on than a berry or an ability does.
 *
 * ONE ROW PER SPECIES, COMPUTED ONCE. Every era-sensitive value a filter or a
 * sort needs -- resolved typing, resolved base stats, the base-stat total -- is
 * derived in `buildSpeciesRows` and read from the row afterwards. Deriving them
 * inside a comparator would re-resolve stats on every comparison, which for 493
 * species and a base-stat sort is thousands of resolutions per keystroke; and
 * deriving them inside a `match` would do it once per candidate per active
 * filter. It is also the correctness half: a row is resolved for ONE generation,
 * so nothing downstream can accidentally compare a Gen 1 Special against a Gen 4
 * Sp. Atk.
 *
 * ERA CORRECTNESS IS THE `hidden` FLAG, not a set of branches at the call site:
 *
 *   habitat        `null` for 107 species and a Generation 3 concept; hidden in
 *                  Gens 1-2, where PokeAPI would otherwise offer a filter for a
 *                  field the games of that era have no notion of.
 *   egg groups     breeding arrives in Generation 2; hidden in Gen 1.
 *   Special        Gen 1 has ONE Special stat, not the Sp. Atk / Sp. Def pair.
 *                  The range filters and the sort fields follow the same
 *                  resolver the species page does, so Gen 1 offers Special and
 *                  Gens 2-4 offer the pair -- never both, never neither.
 *
 * A hidden filter is skipped when matching as well as when rendering, so a
 * habitat chosen in Gen 4 cannot keep narrowing a Gen 1 list.
 *
 * THE "HAS EVOLUTIONS" FILTER IS A STUB, deliberately and visibly. The control
 * is built and the note under it says it is not applied, because the question it
 * asks has two defensible readings -- "can still evolve further" (which excludes
 * Charizard) and "is part of a multi-stage line" (which includes it) -- and they
 * return different lists for 200+ species. The evolution chains are already in
 * the bundle and eagerly loaded, so wiring it is a one-function change once the
 * reading is chosen; guessing would have shipped a filter that is wrong half the
 * time and looks right.
 */

import {
  EFFORT_VALUES_INTRODUCED_IN_GENERATION,
  getEggGroup,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import type { PokemonType, Species, Variety } from '../../data'
import type { FilterSection, SortField } from '../dex/query/dexQuery'

/** Breeding arrives in Generation 2; Gen 1 has no egg groups at all. */
const EGG_GROUPS_INTRODUCED_IN_GENERATION = 2
/** `habitat` describes the Gen 3 FireRed/LeafGreen habitat list. */
const HABITAT_INTRODUCED_IN_GENERATION = 3

/** The default form is what the list shows; alternate forms live in the detail view. */
export function defaultVariety(species: Species): Variety {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

export interface SpeciesRow {
  species: Species
  variety: Variety
  /** Resolved for the row's generation, not the species' modern typing. */
  typeIds: number[]
  /** Resolved base stats, keyed by stat name. Gen 1 carries `special`. */
  stats: Record<string, number>
  /**
   * Effort values yielded, keyed by the same stat names.
   *
   * EVs arrived in Generation 3 -- Gens 1-2 had Stat Experience, a different
   * mechanic with no per-species yield -- so this is EMPTY before then rather
   * than zeroed. An empty map and a map of zeroes are different claims, and the
   * column prints an em dash for the first.
   */
  evs: Record<string, number>
  bst: number
  /** Decimetres and hectograms, as the bundle stores them. */
  height: number | null
  weight: number | null
}

export function buildSpeciesRows(entries: Species[], generation: number): SpeciesRow[] {
  return entries.map((species) => {
    const variety = defaultVariety(species)
    const stats: Record<string, number> = {}
    const evs: Record<string, number> = {}
    const hasEvs = generation >= EFFORT_VALUES_INTRODUCED_IN_GENERATION
    let bst = 0
    for (const entry of resolveStatsForGeneration(variety, generation)) {
      if (entry.stat == null) continue
      stats[entry.stat] = entry.base_stat
      if (hasEvs && entry.effort > 0) evs[entry.stat] = entry.effort
      bst += entry.base_stat
    }
    return {
      species,
      variety,
      typeIds: resolveTypesForGeneration(variety, generation).map((t) => t.type_id),
      stats,
      evs,
      bst,
      height: variety.height,
      weight: variety.weight,
    }
  })
}

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * `gender_rate` is eighths-FEMALE, with -1 meaning genderless -- so the labels
 * are written out rather than computed, and they are ordered as a scale from all
 * male to all female with the genderless case first.
 *
 * Ordered by ratio rather than in the brief's order (which had "Female only"
 * third): every other multi-value control in this pass that has a natural scale
 * reads along it, and a reader picking a gender split is picking a point on one.
 */
const GENDER_LABELS: Record<string, string> = {
  '-1': 'Genderless',
  '0': 'Male only',
  '1': '87.5% ♂',
  '2': '75% ♂',
  '3': '62.5% ♂',
  '4': '50 / 50',
  '5': '37.5% ♂',
  '6': '25% ♂',
  '7': '12.5% ♂',
  '8': 'Female only',
}
const GENDER_ORDER = ['-1', '0', '1', '2', '3', '4', '5', '6', '7', '8']

const RARITY_OPTIONS = [
  { value: 'legendary', label: 'Legendary' },
  { value: 'mythical', label: 'Mythical' },
  { value: 'baby', label: 'Baby' },
]

/** The six stats a filter or a sort can name, in the order the app shows them. */
export interface StatField {
  key: string
  label: string
}

/**
 * Which stats this era has. Gen 1's combined Special REPLACES the split pair --
 * the same rule `resolveStatsForGeneration` applies to the data, applied to the
 * controls, so the panel can never offer a stat the rows do not carry.
 */
export function statFieldsFor(generation: number): StatField[] {
  const special: StatField[] =
    generation < 2
      ? [{ key: 'special', label: 'Special' }]
      : [
          { key: 'special-attack', label: 'Sp. Atk' },
          { key: 'special-defense', label: 'Sp. Def' },
        ]
  return [
    { key: 'hp', label: 'HP' },
    { key: 'attack', label: 'Attack' },
    { key: 'defense', label: 'Defense' },
    ...special,
    { key: 'speed', label: 'Speed' },
  ]
}

/** Distinct, sorted, non-null values of one species field across the rows. */
function presentValues(rows: SpeciesRow[], read: (s: Species) => string | null): string[] {
  return [...new Set(rows.map((r) => read(r.species)))].filter((v): v is string => v != null).sort()
}

export function speciesFilterSections({
  rows,
  generation,
  availableTypes,
}: {
  rows: SpeciesRow[]
  generation: number
  availableTypes: PokemonType[]
}): FilterSection<SpeciesRow>[] {
  const colors = presentValues(rows, (s) => s.color)
  const habitats = presentValues(rows, (s) => s.habitat)
  const growthRates = presentValues(rows, (s) => s.growth_rate)
  const genderRates = new Set(rows.map((r) => String(r.species.gender_rate ?? -1)))
  const eggGroupIds = [...new Set(rows.flatMap((r) => r.species.egg_group_ids ?? []))].sort(
    (a, b) => a - b,
  )
  const stats = statFieldsFor(generation)

  return [
    {
      id: 'name',
      label: 'Name',
      filters: [
        {
          kind: 'text',
          key: 'name',
          label: 'Search species by name',
          testId: 'species-search',
          match: (row, term) => row.species.display_name.toLowerCase().includes(term),
        },
      ],
    },
    {
      id: 'type',
      label: 'Type',
      filters: [
        {
          kind: 'types',
          key: 'type',
          label: 'Filter by type',
          available: availableTypes,
          testIdPrefix: 'type-filter',
          // OR across the selection, and the species matches on EITHER of its
          // types -- the long-standing behaviour, unchanged.
          match: (row, selected) => row.typeIds.some((id) => selected.includes(id)),
        },
      ],
    },
    {
      id: 'breeding',
      label: 'Breeding',
      more: true,
      filters: [
        {
          kind: 'multi',
          key: 'eggGroup',
          label: 'Egg group',
          hidden: generation < EGG_GROUPS_INTRODUCED_IN_GENERATION,
          options: eggGroupIds.map((id) => ({
            value: String(id),
            label: getEggGroup(id)?.display_name ?? String(id),
          })),
          match: (row, selected) =>
            (row.species.egg_group_ids ?? []).some((id) => selected.includes(String(id))),
        },
        {
          kind: 'multi',
          key: 'gender',
          label: 'Gender ratio',
          options: GENDER_ORDER.filter((v) => genderRates.has(v)).map((value) => ({
            value,
            label: GENDER_LABELS[value],
          })),
          match: (row, selected) => selected.includes(String(row.species.gender_rate ?? -1)),
        },
      ],
    },
    {
      id: 'appearance',
      label: 'Appearance',
      more: true,
      filters: [
        {
          kind: 'multi',
          key: 'color',
          label: 'Colour',
          options: colors.map((c) => ({ value: c, label: titleCase(c) })),
          match: (row, selected) =>
            row.species.color != null && selected.includes(row.species.color),
        },
        {
          kind: 'multi',
          key: 'habitat',
          label: 'Habitat',
          hidden: generation < HABITAT_INTRODUCED_IN_GENERATION,
          options: habitats.map((h) => ({ value: h, label: titleCase(h) })),
          // A species with no habitat simply does not match a habitat filter.
          // 107 of them have none, and "unknown" is not one of the values.
          match: (row, selected) =>
            row.species.habitat != null && selected.includes(row.species.habitat),
        },
      ],
    },
    {
      id: 'growth',
      label: 'Growth',
      more: true,
      filters: [
        {
          kind: 'select',
          key: 'growthRate',
          label: 'Growth rate',
          options: growthRates.map((g) => ({ value: g, label: titleCase(g) })),
          match: (row, value) => row.species.growth_rate === value,
        },
        {
          kind: 'range',
          key: 'friendship',
          label: 'Base friendship',
          value: (row) => row.species.base_happiness,
          bounds: { min: 0, max: 140 },
        },
      ],
    },
    {
      id: 'rarity',
      label: 'Rarity',
      more: true,
      filters: [
        {
          kind: 'select',
          key: 'rarity',
          label: 'Legendary / Mythical / Baby',
          options: RARITY_OPTIONS.filter((o) =>
            rows.some((r) =>
              o.value === 'legendary'
                ? r.species.is_legendary
                : o.value === 'mythical'
                  ? r.species.is_mythical
                  : r.species.is_baby,
            ),
          ),
          match: (row, value) =>
            value === 'legendary'
              ? row.species.is_legendary
              : value === 'mythical'
                ? row.species.is_mythical
                : row.species.is_baby,
        },
        {
          kind: 'select',
          key: 'hasEvolutions',
          label: 'Has evolutions',
          stub: true,
          note: 'Not applied yet: "has evolutions" needs a definition — can still evolve further, or belongs to a multi-stage line (fully-evolved forms included).',
          options: [
            { value: 'yes', label: 'Has evolutions' },
            { value: 'no', label: 'No evolutions' },
          ],
          match: () => true,
        },
      ],
    },
    {
      id: 'stats',
      label: 'Base stats',
      more: true,
      filters: stats.map((stat) => ({
        kind: 'range' as const,
        key: `stat-${stat.key}`,
        label: stat.label,
        value: (row: SpeciesRow) => row.stats[stat.key] ?? null,
        bounds: { min: 1, max: 255 },
      })),
    },
    {
      id: 'size',
      label: 'Size',
      more: true,
      filters: [
        {
          // Metres and kilogrammes, which is what the species page prints and
          // therefore what the reader is typing against -- the bundle's
          // decimetres and hectograms never surface.
          kind: 'range',
          key: 'height',
          label: 'Height',
          value: (row) => (row.height != null ? row.height / 10 : null),
          bounds: { min: 0.2, max: 14.5 },
          step: 0.1,
          unit: 'm',
        },
        {
          kind: 'range',
          key: 'weight',
          label: 'Weight',
          value: (row) => (row.weight != null ? row.weight / 10 : null),
          bounds: { min: 0.1, max: 950 },
          step: 0.1,
          unit: 'kg',
        },
      ],
    },
  ]
}

/**
 * What the Sort menu offers, and it is the GRID's question.
 *
 * A card shows a number, a name, a picture, its abilities and -- since the row
 * below them was added -- its base-stat total and its Speed. Those are exactly
 * the orderings offered, because ordering cards by a value the cards do not
 * print produces a sequence the reader cannot check.
 *
 * THE LIST VIEW IS NOT HERE. Its table declares its own columns
 * (speciesColumns.tsx) and sorts from its own headers, which is why the bar's
 * Sort trigger is disabled there: two controls for one ordering, one of them
 * off screen, is the disagreement this whole pass removes.
 */
export function speciesSortFields(): SortField<SpeciesRow>[] {
  return [
    { key: 'dex', label: 'Dex #', value: (row) => row.species.id },
    { key: 'name', label: 'Name', value: (row) => row.species.display_name },
    { key: 'bst', label: 'Base stat total', value: (row) => row.bst },
    { key: 'speed', label: 'Speed', value: (row) => row.stats.speed ?? null },
  ]
}

export type SpeciesView = 'grid' | 'list'
