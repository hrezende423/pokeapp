/**
 * Era resolution: what a species/type actually looked like in a given generation.
 *
 * Current-generation PokeAPI values are wrong for Gen 1-4 in several ways, so
 * every read that feeds the Pokedex goes through here rather than using
 * `variety.types` / `variety.abilities` directly.
 *
 * The shared rule for all `past_*` arrays is the same one the data build uses for
 * type matchups: an entry's `generation_id` means "this configuration applied up
 * to and including that generation". To resolve for generation G, take the
 * *earliest* entry whose generation_id >= G. Anything not covered by such an
 * entry falls through to the current value.
 */

import { getAbility, getType, listTypes } from './loader'
import type {
  Ability,
  AbilitySlot,
  DamageRelations,
  PokemonType,
  StatEntry,
  TypeSlot,
  Variety,
} from './types'

/** Abilities did not exist before Gen 3 — no species had one in RBY or GSC. */
export const ABILITIES_INTRODUCED_IN_GENERATION = 3

/**
 * Hidden abilities are a Generation 5 mechanic: the third slot, reachable only
 * through Dream World and its successors, did not exist in Gen 1-4 at all.
 *
 * This is enforced as a rule rather than left to the data because PokeAPI is
 * incomplete here. It empties a slot for a generation only when it carries a
 * `past_abilities` entry saying so, and 17 of the 493 species in scope have no
 * such entry for their hidden slot -- Koffing's Stench, Typhlosion's Flash Fire,
 * Chikorita's Leaf Guard and 14 others. Those all reported themselves as present
 * in HeartGold/SoulSilver, which is wrong: none of them was obtainable until
 * Black/White. Bulbasaur's Chlorophyll is the well-formed case and disappeared
 * correctly, which is exactly why the gap was easy to miss.
 */
export const HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION = 5

/** PokeAPI's non-battle pseudo-types (`???` and Shadow) are never shown. */
const PSEUDO_TYPE_IDS = new Set([10001, 10002])

/**
 * Types a species had in generation `generation`.
 *
 * Clefairy is the clearest case: it is Fairy in current data but was Normal
 * through Gen 5, so a Gen 1-4 Pokedex must not show it as Fairy.
 */
export function resolveTypesForGeneration(variety: Variety, generation: number): TypeSlot[] {
  const applicable = (variety.past_types ?? [])
    .filter((p) => p.generation_id != null && p.generation_id >= generation)
    .sort((a, b) => (a.generation_id ?? 0) - (b.generation_id ?? 0))

  const slots = applicable.length > 0 ? applicable[0].types : variety.types
  return [...slots].sort((a, b) => a.slot - b.slot)
}

export interface ResolvedAbility {
  slot: number
  is_hidden: boolean
  ability: Ability
}

/**
 * Abilities a species had in generation `generation`.
 *
 * Resolution is *per slot*, not per entry, because a species can have several
 * past entries each covering a different slot. Clefairy has
 * `[{gen 3: slot 2 = null}, {gen 4: slot 3 = null}]`; resolving Gen 3 by taking
 * only the earliest entry would null slot 2 but leave slot 3 pointing at a Gen 5
 * hidden ability. So for each slot we take the earliest entry >= G that mentions
 * it, and a null there means "this slot was empty then".
 *
 * Returns an empty array for Gens 1-2, where abilities did not exist at all.
 */
export function resolveAbilitiesForGeneration(
  variety: Variety,
  generation: number,
): ResolvedAbility[] {
  if (generation < ABILITIES_INTRODUCED_IN_GENERATION) return []

  const pastBySlot = new Map<number, { generation_id: number; entry: AbilitySlot | null }>()
  for (const past of variety.past_abilities ?? []) {
    const gen = past.generation_id
    if (gen == null || gen < generation) continue
    for (const slotEntry of past.abilities) {
      const existing = pastBySlot.get(slotEntry.slot)
      // Earliest applicable entry wins for this slot.
      if (existing && existing.generation_id <= gen) continue
      pastBySlot.set(slotEntry.slot, {
        generation_id: gen,
        entry:
          slotEntry.ability_id == null
            ? null
            : {
                ability_id: slotEntry.ability_id,
                is_hidden: slotEntry.is_hidden,
                slot: slotEntry.slot,
              },
      })
    }
  }

  const resolved: ResolvedAbility[] = []
  const slots = new Set<number>([...variety.abilities.map((a) => a.slot), ...pastBySlot.keys()])

  for (const slot of [...slots].sort((a, b) => a - b)) {
    const override = pastBySlot.get(slot)
    const source = override
      ? override.entry
      : (variety.abilities.find((a) => a.slot === slot) ?? null)
    if (!source) continue // slot was empty in this generation

    // The hidden slot did not exist before Gen 5, whatever the data says about
    // the ability sitting in it -- see HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION.
    // The ability itself often DID exist (Stench is a Gen 3 ability), so the
    // generation check below cannot catch this; the slot is the anachronism.
    if (source.is_hidden && generation < HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION) continue

    const ability = getAbility(source.ability_id)
    if (!ability) continue
    // Belt and braces: an ability introduced after the target generation cannot
    // have existed then, even if PokeAPI has no past entry saying so.
    if ((ability.generation_id ?? 99) > generation) continue

    resolved.push({ slot, is_hidden: source.is_hidden, ability })
  }
  return resolved
}

/** Real battle types that existed in `generation`, in canonical order. */
export function typesInGeneration(generation: number): PokemonType[] {
  return listTypes().filter((t) => !PSEUDO_TYPE_IDS.has(t.id) && t.generation_id <= generation)
}

/** Era-correct damage relations for a type, or undefined if it did not exist yet. */
export function damageRelationsFor(
  typeId: number,
  generation: number,
): DamageRelations | undefined {
  return getType(typeId)?.damage_relations_by_generation[String(generation)]
}

export interface Effectiveness {
  type: PokemonType
  multiplier: number
}

/**
 * Defensive type chart for a species: how much damage each attacking type does.
 *
 * Reads each *defending* type's relations, since `double_damage_from` on type D
 * lists the types that hit D for 2x. Multipliers compose across a dual typing.
 *
 * Only types that existed in `generation` are considered, so a Gen 1 selection
 * yields 15 rows with no Dark or Steel.
 */
export function typeEffectivenessAgainst(
  defendingTypeIds: number[],
  generation: number,
): Effectiveness[] {
  const attacking = typesInGeneration(generation)
  const defending = defendingTypeIds
    .map((id) => damageRelationsFor(id, generation))
    .filter((r): r is DamageRelations => r != null)

  return attacking.map((type) => {
    let multiplier = 1
    for (const relations of defending) {
      if (relations.no_damage_from.includes(type.id)) multiplier *= 0
      else if (relations.double_damage_from.includes(type.id)) multiplier *= 2
      else if (relations.half_damage_from.includes(type.id)) multiplier *= 0.5
    }
    return { type, multiplier }
  })
}

/**
 * Base stats a species had in generation `generation`.
 *
 * RESOLVED PER STAT, not per entry, for the same reason abilities are: a variety
 * can carry several past entries that each touch a different stat, and taking only
 * the earliest applicable one would drop the others. 20 of the 493 in scope have
 * exactly that shape -- Beedrill has a Gen 1 `special` entry AND a Gen 5 `attack`
 * entry, and the Gen 5 one is what applied in Gen 1 too (Attack 80, not the
 * current 90). Per-entry resolution would have shown the modern 90.
 *
 * THE GEN 1 SPECIAL IS A REPLACEMENT, NOT AN OVERRIDE. `past_stats` for Gen 1
 * carries a single `special` value; the split Special Attack / Special Defense
 * pair did not exist then, so they are removed rather than left beside it. That is
 * safe to key on the presence of `special`, because no current-data variety has
 * that stat -- it can only arrive from a Gen 1 entry.
 */
export function resolveStatsForGeneration(variety: Variety, generation: number): StatEntry[] {
  const overrides = new Map<string, { generation_id: number; entry: StatEntry }>()
  for (const past of variety.past_stats ?? []) {
    const gen = past.generation_id
    if (gen == null || gen < generation) continue
    for (const entry of past.stats) {
      if (entry.stat == null) continue
      const existing = overrides.get(entry.stat)
      // Earliest applicable entry wins for this stat.
      if (existing && existing.generation_id <= gen) continue
      overrides.set(entry.stat, { generation_id: gen, entry })
    }
  }

  const merged = new Map<string, StatEntry>()
  for (const entry of variety.stats) {
    if (entry.stat != null) merged.set(entry.stat, entry)
  }
  for (const [stat, override] of overrides) merged.set(stat, override.entry)

  if (merged.has('special')) {
    merged.delete('special-attack')
    merged.delete('special-defense')
  }

  return STAT_ORDER.filter((stat) => merged.has(stat)).map((stat) => merged.get(stat)!)
}

/**
 * Canonical stat order, with Gen 1's combined Special sitting where the split
 * pair would start. Anything the bundle grows that is not listed here would be
 * dropped by resolveStatsForGeneration, which is the intent: an unrecognised
 * stat is a data-build question, not something to render in an arbitrary slot.
 */
const STAT_ORDER = [
  'hp',
  'attack',
  'defense',
  'special',
  'special-attack',
  'special-defense',
  'speed',
] as const

/**
 * EVs (and their yield) arrived in Gen 3. Gens 1-2 had Stat Experience, which is
 * a different mechanic with no per-species yield to show, so the field is hidden
 * rather than relabelled.
 */
export const EFFORT_VALUES_INTRODUCED_IN_GENERATION = 3

/** Gender split as percentages, or null for a genderless species. */
export function genderRatio(genderRate: number | null): { male: number; female: number } | null {
  // PokeAPI encodes gender_rate as eighths-female, with -1 meaning genderless.
  if (genderRate == null || genderRate < 0) return null
  const female = (genderRate / 8) * 100
  return { male: 100 - female, female }
}

/** Catch rate as an approximate percentage at full HP with a Poke Ball. */
export function captureRatePercent(captureRate: number | null): number | null {
  if (captureRate == null) return null
  return Math.round((captureRate / 255) * 100)
}
