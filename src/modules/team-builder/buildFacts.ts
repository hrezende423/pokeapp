/**
 * Everything the screens need to know about a build, derived from the data layer.
 *
 * THIS FILE IS THE CHOKE POINT FOR MOVE TYPES, and that is its main reason to
 * exist. The handoff's standing rule is that Team Building must never read a
 * move's `type_id` directly: several moves changed type between generations
 * (Charm, Sweet Kiss and Moonlight are stored as FAIRY, a Gen 6 type, with a
 * `past_values` entry giving Normal), and a raw read renders a Gen 1-4 build's
 * Charm as Fairy. That bug is live elsewhere in the app; new code here must not
 * reproduce it.
 *
 * The enforcement is structural rather than a comment asking nicely: `MoveRow`
 * carries a resolved type NAME and deliberately exposes neither `type_id` nor the
 * `Move` object, so a component physically cannot reach past the resolver. If a
 * screen needs something new about a move, it gets added to `moveRowFor` here --
 * where the generation is in scope -- and not fetched at the call site.
 *
 * Everything else here is the same idea applied to abilities, natures and items:
 * generation-correct option lists, computed once, so no screen re-derives an era
 * rule beside a dropdown.
 */

import {
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  getType,
  itemExistsInGeneration,
  listItems,
  listNatures,
  naturesExistInGeneration,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import type { Species, StatEntry, Variety } from '../../data'
import { itemArtworkUrl, itemIconUrl } from '../../data/itemArtwork'
import { resolveMoveTypeNameForGeneration } from '../../data/moveEra'
import type { Build, Gender } from './model'
import type { NatureMods, StatKey } from './statMath'

export interface SpeciesFacts {
  species: Species
  variety: Variety
  /** Era-correct type slugs, one or two. */
  types: string[]
  stats: StatEntry[]
}

export function buildSpecies(build: Pick<Build, 'speciesId' | 'pokemonId' | 'generation'>) {
  const species = getSpecies(build.speciesId)
  if (!species) return null
  const variety =
    species.varieties.find((v) => v.pokemon_id === build.pokemonId) ??
    species.varieties.find((v) => v.is_default) ??
    species.varieties[0]
  if (!variety) return null
  return {
    species,
    variety,
    /* Species types go through the ERA resolver too, for the same reason move
       types do: Clefairy reads as Fairy in current data but was Normal through
       Gen 5, so a Gen 1-4 build must not show it as Fairy. */
    types: resolveTypesForGeneration(variety, build.generation)
      .map((slot) => getType(slot.type_id)?.name ?? null)
      .filter((n): n is string => n != null),
    stats: resolveStatsForGeneration(variety, build.generation),
  } satisfies SpeciesFacts
}

/** Era-correct defending type IDs, which is what the effectiveness chart wants. */
export function typeIdsFor(variety: Variety, generation: number): number[] {
  return resolveTypesForGeneration(variety, generation).map((slot) => slot.type_id)
}

export function baseStatFor(stats: StatEntry[], key: StatKey): number {
  return stats.find((s) => s.stat === key)?.base_stat ?? 0
}

/* -------------------------------------------------------------------- moves */

/**
 * A move as the UI is allowed to see it.
 *
 * NO `type_id`, NO `move`. See this file's header -- the omission is the point.
 */
export interface MoveRow {
  moveId: number
  name: string
  /** Already resolved against the build's generation. Null if the move is unknown. */
  type: string | null
  category: string | null
  isEvent: boolean
}

/** The ONLY place in this module that turns a move id into a renderable type. */
export function moveRowFor(moveId: number, generation: number, isEvent = false): MoveRow | null {
  const move = getMove(moveId)
  if (!move) return null
  return {
    moveId,
    name: move.display_name,
    type: resolveMoveTypeNameForGeneration(move, generation),
    category: move.damage_class,
    isEvent,
  }
}

/** The build's four slots, nulls preserved so empty slots still render. */
export function moveRowsFor(build: Pick<Build, 'moveIds' | 'generation'>): (MoveRow | null)[] {
  return build.moveIds.map((id) => (id == null ? null : moveRowFor(id, build.generation)))
}

export function categoryLabel(category: string | null): string {
  if (category === 'physical') return 'Physical'
  if (category === 'special') return 'Special'
  if (category === 'status') return 'Status'
  return ''
}

/* --------------------------------------------------- abilities / natures / items */

export interface Option {
  value: number
  label: string
}

/**
 * This species' own abilities, never the app-wide list.
 *
 * Hidden abilities are filtered out: they arrive in Gen 5, outside this app's
 * Gen 1-4 scope, and `resolveAbilitiesForGeneration` already returns nothing at
 * all before Gen 3.
 */
export function abilityOptionsFor(variety: Variety, generation: number): Option[] {
  return resolveAbilitiesForGeneration(variety, generation)
    .filter((resolved) => !resolved.is_hidden)
    .map((resolved) => ({ value: resolved.ability.id, label: resolved.ability.display_name }))
}

export function natureOptionsFor(generation: number): Option[] {
  if (!naturesExistInGeneration(generation)) return []
  return listNatures()
    .map((n) => ({ value: n.id, label: n.display_name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Items that actually exist in this generation -- not the whole bag. */
export function itemOptionsFor(generation: number): Option[] {
  return listItems()
    .filter((item) => itemExistsInGeneration(item, generation))
    .map((item) => ({ value: item.id, label: item.display_name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function natureModsFor(natureId: number | null): NatureMods {
  const nature = natureId == null ? null : getNature(natureId)
  return {
    increased: (nature?.increased_stat ?? null) as StatKey | null,
    decreased: (nature?.decreased_stat ?? null) as StatKey | null,
  }
}

export function natureName(natureId: number | null): string {
  return natureId == null ? '—' : (getNature(natureId)?.display_name ?? '—')
}

export function abilityName(abilityId: number | null): string {
  return abilityId == null ? '—' : (getAbility(abilityId)?.display_name ?? '—')
}

export function itemName(itemId: number | null): string {
  return itemId == null ? '—' : (getItem(itemId)?.display_name ?? '—')
}

/**
 * The held item's picture: official artwork first, in-game icon as the fallback.
 *
 * BOTH, NOT ONE, because neither is sufficient alone. The 90x90 Dream World
 * render is the official artwork and is what this module shows, but it exists
 * for only about half the bag and 404s for the rest; the 30x30 in-game icon
 * covers 561 of 563 items and never 404s. So the caller renders `artwork` and
 * swaps to `icon` from `onError` -- the same pairing itemArtwork.ts documents.
 */
export function itemArtFor(itemId: number | null): { artwork: string; icon: string } | null {
  if (itemId == null) return null
  const item = getItem(itemId)
  const artwork = itemArtworkUrl(item)
  const icon = itemIconUrl(item)
  if (!artwork && !icon) return null
  return { artwork: artwork ?? icon!, icon: icon ?? artwork! }
}

/* ------------------------------------------------------------------ factory */

/**
 * A blank build for `generation`, defaulting to the first species in the dex.
 *
 * Defaults are generation-aware rather than "modern with nulls": friendship
 * starts at the species' own base happiness (the value the games give you), and
 * gender starts at whatever the species can actually be, so a genderless species
 * is born with `null` and never renders an indicator. Ability defaults to the
 * species' first real slot so a Gen 3-4 build is never in an impossible state.
 */
export function newBuildInit(generation: number, speciesId = 1): Omit<Build, 'id'> {
  const species = getSpecies(speciesId)
  const variety = species?.varieties.find((v) => v.is_default) ?? species?.varieties[0] ?? null
  const genders = species ? genderOptionsFor(species) : null
  const abilities = variety ? abilityOptionsFor(variety, generation) : []

  return {
    generation,
    speciesId,
    pokemonId: variety?.pokemon_id ?? speciesId,
    nickname: '',
    gender: genders ? genders[0] : null,
    shiny: false,
    level: 50,
    friendship: generation >= 2 ? (species?.base_happiness ?? 70) : 0,
    itemId: null,
    abilityId: abilities.length ? abilities[0].value : null,
    natureId: null,
    moveIds: [null, null, null, null],
    effort: {},
    individual: {},
    tags: [],
    notes: '',
  }
}

/* ------------------------------------------------------------------- gender */

/**
 * Which genders this species can be, or null for a genderless one.
 *
 * A null return means the field is HIDDEN entirely -- no dash, no "N/A". A single
 * entry means the field renders disabled at that value.
 */
export function genderOptionsFor(species: Species): Gender[] | null {
  const rate = species.gender_rate
  if (rate == null || rate < 0) return null
  if (rate === 0) return ['male']
  if (rate === 8) return ['female']
  return ['male', 'female']
}

export function genderGlyph(gender: Gender | null): string | null {
  if (gender === 'male') return '♂'
  if (gender === 'female') return '♀'
  return null
}

/* ------------------------------------------------------------------ display */

/**
 * The card headline, and the parenthetical under it.
 *
 * The species name in parens appears ONLY when the nickname differs from it --
 * "Pikachu (Pikachu)" is noise, and the rule is explicit in the spec.
 */
export function displayName(
  build: Pick<Build, 'nickname'>,
  species: Species,
): { primary: string; secondary: string | null } {
  const nickname = build.nickname.trim()
  if (!nickname) return { primary: species.display_name, secondary: null }
  const differs = nickname.toLowerCase() !== species.display_name.toLowerCase()
  return { primary: nickname, secondary: differs ? species.display_name : null }
}

/** "252Atk/252SpA/6Spe" -- only stats with investment, in stat order. */
export function spreadSummary(
  build: Pick<Build, 'effort'>,
  keys: readonly StatKey[],
): string | null {
  const parts = keys
    .map((key) => ({ key, value: build.effort[key] ?? 0 }))
    .filter((e) => e.value > 0)
    .map((e) => `${e.value}${SHORT_STAT[e.key]}`)
  return parts.length ? parts.join('/') : null
}

const SHORT_STAT: Record<StatKey, string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  special: 'Spc',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}

export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  special: 'Spc',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}
