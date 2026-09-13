/**
 * Every dex's filter and sort config, in one place.
 *
 * These used to be `useMemo`s inside each dex component, which was right while
 * each dex rendered its own controls above its own list. They do not any more:
 * there is ONE Search/Filter menu and ONE Sort menu, both in the app bar, and
 * the bar is rendered ABOVE the active module in the tree -- so it cannot read a
 * config that only exists once that module has mounted. The configs are built at
 * app level instead (DexQueryProvider), which means they have to be plain
 * functions of the entry list rather than hooks inside a component.
 *
 * The Pokedex's config is the one that stayed where it was, in
 * modules/pokedex/speciesQuery.ts: it is by far the largest, it needs its own
 * row type, and keeping it beside the module it describes is worth the one
 * exception.
 */

import { LATEST_GENERATION, getItem } from '../../../data'
import type { Ability, Berry, EggGroup, Item, Move, Nature, PokemonType } from '../../../data'
import { asStrings, type FilterSection, type SortField } from './dexQuery'

const titleCase = (value: string) =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Every dex's first section, and the only one some of them have. */
function nameSection<T>(dexId: string, noun: string, read: (entry: T) => string): FilterSection<T> {
  return {
    id: 'name',
    label: 'Name',
    filters: [
      {
        kind: 'text',
        key: 'name',
        label: `Search ${noun} by name`,
        testId: `${dexId}-search`,
        match: (entry, term) => read(entry).toLowerCase().includes(term),
      },
    ],
  }
}

// ------------------------------------------------------------------ abilities

export function abilitydexSections(entries: Ability[]): FilterSection<Ability>[] {
  /*
    THE GENERATION OPTIONS ARE READ OFF THE LIST, not written down. Abilities
    arrived in Generation 3, so inside this app's scope the honest answer is "3
    or 4" -- but the list is already clamped twice over (by the Gen 1-4 presence
    rule and by the selected game), and a hardcoded pair would offer Generation 4
    to someone playing Ruby.

    is_main_series is the only other field the bundle carries, and it is `true`
    for all 161 -- a filter with one value cannot narrow anything -- so
    generation is the only filter here and the dex stays lean rather than padded.
  */
  const generations = [...new Set(entries.map((a) => a.generation_id))]
    .filter((g): g is number => g != null)
    .sort((a, b) => a - b)
  return [
    nameSection<Ability>('abilitydex', 'abilities', (a) => a.display_name),
    {
      id: 'generation',
      label: 'Generation introduced',
      filters: [
        {
          kind: 'select',
          key: 'generation',
          label: 'Generation introduced',
          options: generations.map((g) => ({ value: String(g), label: `Generation ${g}` })),
          match: (ability, value) => String(ability.generation_id) === value,
        },
      ],
    },
  ]
}

/*
  ABILITY # LEADS AND IS THE DEFAULT. The shipped list is NOT alphabetical -- it
  is in ability-id order, which is what the #001 in every row says -- so Name as
  the default would silently re-order a screen nobody asked to re-order, and
  leaving the real order off the field list would leave no way back to it.
*/
export const abilitydexSorts: SortField<Ability>[] = [
  { key: 'id', label: 'Ability #', value: (a) => a.id },
  { key: 'name', label: 'Name', value: (a) => a.display_name },
  { key: 'generation', label: 'Generation', value: (a) => a.generation_id },
]

// -------------------------------------------------------------------- berries

/**
 * The berry's dominant flavour: the highest-potency entry of the five.
 *
 * `flavors` always carries all five with a potency each, and 0 is by far the
 * commonest value -- so "the flavour it tastes of" is the maximum, and a berry
 * whose maximum is 0 has no flavour at all rather than an arbitrary first one.
 * TIES ARE REAL and are not resolved here: a berry can be equally spicy and dry,
 * and this returns every flavour at the maximum so the filter matches on any of
 * them. Picking one would invent a precedence the games do not have.
 */
export function dominantFlavors(berry: Berry): string[] {
  const potency = Math.max(0, ...berry.flavors.map((f) => f.potency))
  if (potency === 0) return []
  return berry.flavors
    .filter((f) => f.potency === potency && f.flavor)
    .map((f) => f.flavor as string)
}

/** Berries carry a bare `name`; the display name lives on the linked item. */
export function berryName(berry: Berry): string {
  const item = berry.item_id != null ? getItem(berry.item_id) : undefined
  if (item) return item.display_name
  return `${berry.name.charAt(0).toUpperCase()}${berry.name.slice(1)} Berry`
}

/* Soft to hard, not alphabetical: firmness is an ordered scale and the reader is
   picking a point on it, so the buttons read in the order the scale runs. */
const FIRMNESS_OPTIONS = [
  { value: 'very-soft', label: 'Very Soft' },
  { value: 'soft', label: 'Soft' },
  { value: 'hard', label: 'Hard' },
  { value: 'very-hard', label: 'Very Hard' },
  { value: 'super-hard', label: 'Super Hard' },
]

/* The games' own flavour order, which is the order the five appear in on every
   berry record. */
const FLAVOR_OPTIONS = [
  { value: 'spicy', label: 'Spicy' },
  { value: 'dry', label: 'Dry' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'bitter', label: 'Bitter' },
  { value: 'sour', label: 'Sour' },
]

export function berrydexSections(availableTypes: PokemonType[]): FilterSection<Berry>[] {
  return [
    nameSection<Berry>('berrydex', 'berries', berryName),
    {
      /* The type filter stays a primary control here for the same reason it is
         one on the Pokedex and the Movedex: it is the axis people come to a list
         of 64 berries with. */
      id: 'gift-type',
      label: 'Natural Gift type',
      filters: [
        {
          kind: 'types',
          key: 'giftType',
          label: 'Natural Gift type',
          available: availableTypes,
          testIdPrefix: 'berrydex-ng-type',
          match: (berry, selected) =>
            berry.natural_gift_type_id != null && selected.includes(berry.natural_gift_type_id),
        },
      ],
    },
    {
      id: 'taste',
      label: 'Taste',
      more: true,
      filters: [
        {
          kind: 'multi',
          key: 'firmness',
          label: 'Firmness',
          options: FIRMNESS_OPTIONS,
          match: (berry, selected) => berry.firmness != null && selected.includes(berry.firmness),
        },
        {
          kind: 'multi',
          key: 'flavor',
          label: 'Dominant flavour',
          options: FLAVOR_OPTIONS,
          match: (berry, selected) =>
            dominantFlavors(berry).some((flavor) => selected.includes(flavor)),
        },
      ],
    },
    {
      id: 'values',
      label: 'Values',
      more: true,
      filters: [
        {
          kind: 'range',
          key: 'ngPower',
          label: 'Natural Gift power',
          value: (berry) => berry.natural_gift_power,
          bounds: { min: 60, max: 80 },
        },
        {
          kind: 'range',
          key: 'size',
          label: 'Size',
          value: (berry) => berry.size,
          bounds: { min: 20, max: 300 },
          unit: 'mm',
        },
        {
          kind: 'range',
          key: 'smoothness',
          label: 'Smoothness',
          value: (berry) => berry.smoothness,
          bounds: { min: 20, max: 60 },
        },
      ],
    },
    {
      id: 'growing',
      label: 'Growing',
      more: true,
      filters: [
        {
          kind: 'range',
          key: 'growthTime',
          label: 'Growth time',
          value: (berry) => berry.growth_time,
          bounds: { min: 2, max: 24 },
          unit: 'h/stage',
        },
        {
          kind: 'range',
          key: 'maxHarvest',
          label: 'Max harvest',
          value: (berry) => berry.max_harvest,
          bounds: { min: 5, max: 15 },
        },
      ],
    },
  ]
}

export const berrydexSorts: SortField<Berry>[] = [
  { key: 'id', label: 'Berry #', value: (b) => b.id },
  { key: 'name', label: 'Name', value: (b) => berryName(b) },
  { key: 'ngPower', label: 'Gift power', value: (b) => b.natural_gift_power },
  { key: 'size', label: 'Size', value: (b) => b.size },
  { key: 'growthTime', label: 'Growth time', value: (b) => b.growth_time },
  { key: 'maxHarvest', label: 'Max harvest', value: (b) => b.max_harvest },
]

// ---------------------------------------------------------------------- items

export function itemdexSections(entries: Item[]): FilterSection<Item>[] {
  /*
    POCKET FIRST, CATEGORY SECOND, AND THE SECOND IS SCOPED BY THE FIRST.

    They are separate fields rather than a coarse and a fine version of one thing
    -- 40 categories map onto 8 pockets, and the mapping lives on item-category
    upstream -- but they are not independent either. Forty category buttons is an
    unreadable row, and offering "Revival" while the reader has narrowed to Poke
    Balls offers a choice that can only return nothing.
  */
  const pockets = [...new Set(entries.map((i) => i.pocket))]
    .filter((p): p is string => p != null)
    .sort()
  const categoriesByPocket = new Map<string, Set<string>>()
  for (const item of entries) {
    if (item.pocket == null || item.category == null) continue
    const set = categoriesByPocket.get(item.pocket) ?? new Set<string>()
    set.add(item.category)
    categoriesByPocket.set(item.pocket, set)
  }
  const generations = [...new Set(entries.flatMap((i) => i.generation_ids))]
    .filter((g) => g <= LATEST_GENERATION)
    .sort((a, b) => a - b)

  return [
    nameSection<Item>('itemdex', 'items', (i) => i.display_name),
    {
      id: 'pocket',
      label: 'Pocket',
      filters: [
        {
          kind: 'multi',
          key: 'pocket',
          label: 'Pocket',
          options: pockets.map((p) => ({ value: p, label: titleCase(p) })),
          match: (item, selected) => item.pocket != null && selected.includes(item.pocket),
        },
      ],
    },
    {
      id: 'category',
      label: 'Category',
      more: true,
      filters: [
        {
          kind: 'multi',
          key: 'category',
          label: 'Category',
          options: (values) => {
            const chosen = asStrings(values.pocket)
            const inScope = new Set<string>()
            for (const [pocket, categories] of categoriesByPocket) {
              if (chosen.length > 0 && !chosen.includes(pocket)) continue
              for (const category of categories) inScope.add(category)
            }
            return [...inScope].sort().map((c) => ({ value: c, label: titleCase(c) }))
          },
          match: (item, selected) => item.category != null && selected.includes(item.category),
        },
      ],
    },
    {
      id: 'generation',
      label: 'Generation',
      more: true,
      filters: [
        {
          kind: 'select',
          key: 'generation',
          label: 'Available in generation',
          options: generations.map((g) => ({ value: String(g), label: `Generation ${g}` })),
          // `generation_ids` is every generation the item is INDEXED in, not one
          // introduction figure, so this is a membership test rather than a
          // comparison -- an item can leave and return.
          match: (item, value) => item.generation_ids.includes(Number(value)),
        },
      ],
    },
  ]
}

export const itemdexSorts: SortField<Item>[] = [
  { key: 'id', label: 'Item #', value: (i) => i.id },
  { key: 'name', label: 'Name', value: (i) => i.display_name },
  { key: 'fling', label: 'Fling power', value: (i) => i.fling_power },
  { key: 'pocket', label: 'Pocket', value: (i) => i.pocket },
  { key: 'category', label: 'Category', value: (i) => i.category },
]

// -------------------------------------------------------------------- natures

const NATURE_STATS = ['attack', 'defense', 'special-attack', 'special-defense', 'speed']
const NATURE_STAT_LABELS: Record<string, string> = {
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

const isNeutralNature = (n: Nature) => n.increased_stat == null || n.decreased_stat == null

export function naturedexSections(): FilterSection<Nature>[] {
  /*
    HP IS ABSENT FROM BOTH STAT LISTS because no nature has ever affected it --
    that is why the matrix is 5x5 and not 6x6. The five neutral natures carry
    increased_stat AND decreased_stat as null rather than as the same stat, so
    they can only be reached through the Neutral toggle, never through either
    stat select, and the flavour selects skip them for the same reason.
  */
  const statOptions = NATURE_STATS.map((stat) => ({
    value: stat,
    label: NATURE_STAT_LABELS[stat],
  }))
  const flavorOptions = ['spicy', 'dry', 'sweet', 'bitter', 'sour'].map((flavor) => ({
    value: flavor,
    label: titleCase(flavor),
  }))
  return [
    nameSection<Nature>('naturedex', 'natures', (n) => n.display_name),
    {
      id: 'stats',
      label: 'Stats',
      more: true,
      filters: [
        {
          kind: 'select',
          key: 'increased',
          label: 'Raised stat',
          options: statOptions,
          match: (nature, value) => nature.increased_stat === value,
        },
        {
          kind: 'select',
          key: 'decreased',
          label: 'Lowered stat',
          options: statOptions,
          match: (nature, value) => nature.decreased_stat === value,
        },
        {
          kind: 'toggle',
          key: 'neutral',
          label: 'Neutral natures only',
          match: (nature) => isNeutralNature(nature),
        },
      ],
    },
    {
      id: 'flavour',
      label: 'Flavour',
      more: true,
      filters: [
        {
          kind: 'select',
          key: 'likes',
          label: 'Liked flavour',
          options: flavorOptions,
          match: (nature, value) => nature.likes_flavor === value,
        },
        {
          kind: 'select',
          key: 'hates',
          label: 'Disliked flavour',
          options: flavorOptions,
          match: (nature, value) => nature.hates_flavor === value,
        },
      ],
    },
  ]
}

// ---------------------------------------------------------------- egg groups

/**
 * NO FILTERS BEYOND THE NAME AND NO SORT, and that is a decision rather than an
 * omission: an egg group record is `{ id, name, display_name }`, so there is no
 * field to filter on and nothing but the name and the id to order by -- both
 * visible at a glance in a fifteen-row list.
 */
export function breedingdexSections(): FilterSection<EggGroup>[] {
  return [nameSection<EggGroup>('breedingdex', 'egg groups', (g) => g.display_name)]
}

// ---------------------------------------------------------------------- moves

/**
 * THE MOVEDEX HAS FILTERS BUT NO SORT MENU, and both halves are deliberate.
 *
 * Its search and type filter were an always-visible row above the table until
 * the controls moved to the bar; they are the same two controls, in the one
 * place the app now keeps them. Its SORTING is its column headers, which is the
 * right control for a table and is why no sort fields are declared -- the bar's
 * Sort trigger only appears for a dex that has some.
 */
export function movedexSections(availableTypes: PokemonType[]): FilterSection<Move>[] {
  return [
    nameSection<Move>('movedex', 'moves', (m) => m.display_name),
    {
      id: 'type',
      label: 'Type',
      filters: [
        {
          kind: 'types',
          key: 'type',
          label: 'Filter moves by type',
          available: availableTypes,
          testIdPrefix: 'movedex-type',
          match: (move, selected) => move.type_id != null && selected.includes(move.type_id),
        },
      ],
    },
  ]
}
