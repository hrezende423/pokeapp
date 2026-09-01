/**
 * The species page's fact derivations, kept out of the components.
 *
 * Everything here is pure and takes its era as an argument, so a claim the Info
 * tab makes can be asserted directly rather than only through the DOM. Nothing in
 * here reaches for the version-group context.
 *
 * WHAT WAS VERIFIED IN THE BUNDLE BEFORE ANY OF IT WAS BUILT, rather than assumed
 * from PokeAPI's docs (all 493 in-scope species, from public/data/species.json):
 *
 *   held_items    238 species have at least one. Shape is
 *                 `{ item_id, versions: [{ version, rarity }] }` -- a per-VERSION
 *                 rarity, not a per-version-group one. Only three rarities occur
 *                 (5, 50, 100) and the versions present are Gen 3-4 only: no Gen
 *                 1-2 version appears anywhere, so wild held items simply have no
 *                 record before Ruby/Sapphire. 21 entries carry a rarity that
 *                 DIFFERS between versions, which is why the scope filter below
 *                 reduces per version and not per group.
 *   shape         populated for all 493, 14 distinct values.
 *   color         populated for all 493, 10 distinct values.
 *   growth_rate   populated for all 493, 6 distinct values.
 *   capture_rate, base_happiness, hatch_counter, gender_rate: all populated.
 *   habitat       missing for 107 -- not shown, and not asked for.
 *   footprint     no such field, in this bundle or in PokeAPI's pokemon-species
 *                 payload. The sprite URLs 404 upstream. Omitted, as decided.
 */

import { getItem } from '../../data'
import type { Item, Species, StatEntry, Variety, VersionGroup } from '../../data'

/** Highest base stat in Gen 1-4 is Blissey's 255 HP; the bars scale to it. */
export const MAX_BASE_STAT = 255

export const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  special: 'Special',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

/** `medium-slow` -> `Medium Slow`. Em dash for a missing value, never "null". */
export function titleCase(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Egg cycles as an approximate step count.
 *
 * 255 steps per cycle is the Gen 3-4 figure and the one the app's scope mostly
 * lives in (Gen 2 used 256, Gen 5+ 257). Labelled "~" in the UI for exactly that
 * reason -- the cycles number is the exact fact, the steps are the readable gloss.
 */
export const STEPS_PER_EGG_CYCLE = 255

export function hatchSteps(hatchCounter: number | null): number | null {
  if (hatchCounter == null) return null
  return (hatchCounter + 1) * STEPS_PER_EGG_CYCLE
}

export interface HeldItemEntry {
  item: Item
  /** Versions in scope that grant it, with the rarity each one uses. */
  versions: { version: string; rarity: number }[]
  /** The single rarity when every in-scope version agrees, else null. */
  uniformRarity: number | null
}

/**
 * Wild-held items for one variety, scoped to the selected game.
 *
 * SCOPED PER VERSION, NOT PER VERSION GROUP, because 21 of the entries in the
 * bundle carry different rarities for versions inside the same group. Reducing to
 * the group first would have had to pick one of them, and picking silently is how
 * a 5% chance gets reported as 50%.
 *
 * `versionGroup` null means the "All" selection: nothing is filtered out, and a
 * disagreeing rarity is reported per version instead of collapsed.
 */
export function heldItemsForScope(
  variety: Variety,
  versionGroup: VersionGroup | null,
): HeldItemEntry[] {
  const inScope = versionGroup
    ? new Set(versionGroup.versions.filter((v): v is string => v != null))
    : null

  const out: HeldItemEntry[] = []
  for (const held of variety.held_items ?? []) {
    const versions = held.versions
      .filter((v): v is { version: string; rarity: number } => v.version != null)
      .filter((v) => inScope == null || inScope.has(v.version))
    if (versions.length === 0) continue
    const item = getItem(held.item_id)
    if (!item) continue
    const rarities = new Set(versions.map((v) => v.rarity))
    out.push({ item, versions, uniformRarity: rarities.size === 1 ? versions[0].rarity : null })
  }
  return out
}

/** Stats with a non-zero effort value, i.e. the EV yield. */
export function evYield(stats: StatEntry[]): { stat: string; effort: number }[] {
  return stats
    .filter((s) => s.stat != null && s.effort > 0)
    .map((s) => ({ stat: s.stat as string, effort: s.effort }))
}

/** Total of the resolved base stats, which differs per generation in Gen 1. */
export function statTotal(stats: StatEntry[]): number {
  return stats.reduce((sum, s) => sum + s.base_stat, 0)
}

export const defaultVariety = (species: Species): Variety | undefined =>
  species.varieties.find((v) => v.is_default) ?? species.varieties[0]

/**
 * A version group's display name: 'heartgold-soulsilver' -> 'HeartGold / SoulSilver'.
 *
 * The cased-name table is here rather than derived, because capitalising each
 * hyphen-separated part gives "Heartgold / Soulsilver" -- these are trademarks
 * with internal capitals, and the app shows them to a reader who knows that.
 */
const VERSION_GROUP_NAMES: Record<string, string> = {
  'red-blue': 'Red / Blue',
  yellow: 'Yellow',
  'gold-silver': 'Gold / Silver',
  crystal: 'Crystal',
  'ruby-sapphire': 'Ruby / Sapphire',
  emerald: 'Emerald',
  'firered-leafgreen': 'FireRed / LeafGreen',
  'diamond-pearl': 'Diamond / Pearl',
  platinum: 'Platinum',
  'heartgold-soulsilver': 'HeartGold / SoulSilver',
  colosseum: 'Colosseum',
  xd: 'XD: Gale of Darkness',
  'red-green-japan': 'Red / Green (JP)',
  'blue-japan': 'Blue (JP)',
}

export function versionGroupLabel(name: string): string {
  return VERSION_GROUP_NAMES[name] ?? titleCase(name)
}

const VERSION_NAMES: Record<string, string> = {
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
  gold: 'Gold',
  silver: 'Silver',
  crystal: 'Crystal',
  ruby: 'Ruby',
  sapphire: 'Sapphire',
  emerald: 'Emerald',
  firered: 'FireRed',
  leafgreen: 'LeafGreen',
  diamond: 'Diamond',
  pearl: 'Pearl',
  platinum: 'Platinum',
  heartgold: 'HeartGold',
  soulsilver: 'SoulSilver',
  colosseum: 'Colosseum',
  xd: 'XD',
  'red-japan': 'Red (JP)',
  'green-japan': 'Green (JP)',
  'blue-japan': 'Blue (JP)',
}

export function versionLabel(name: string): string {
  return VERSION_NAMES[name] ?? titleCase(name)
}

export const ROMAN = ['0', 'I', 'II', 'III', 'IV'] as const

/** 'Generation IV', for the page's own generation labels. */
export function generationLabel(generation: number): string {
  return `Generation ${ROMAN[generation] ?? generation}`
}
