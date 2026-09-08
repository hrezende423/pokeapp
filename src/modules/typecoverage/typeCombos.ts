/**
 * The type-coverage module's data layer: defending TYPINGS, not defending types.
 *
 * EVERY VIEW IN THIS MODULE ASKS ITS QUESTION ABOUT A `TypeCombo`, which is one
 * or two types. That is the whole point of the shape and it is deliberate
 * future-proofing rather than generality for its own sake: only the Matrix view
 * needs dual typings today, but Flow, Against and Card are all expected to grow
 * the same capability, and the cheapest way to keep that from being a rewrite is
 * to make the single-type case a combo of length one everywhere from the start.
 * So nothing here takes a bare `typeId` for the defending side, and the three
 * single-type views call `singleCombos()` rather than iterating types.
 *
 * IT COMPUTES NO CHART OF ITS OWN. `typeEffectivenessAgainst` in data/era.ts
 * already resolves era-correct relations and already composes them across a dual
 * typing, so `multipliersAgainst` is a thin pass through it. Re-deriving the
 * arithmetic beside it is exactly the second-code-path mistake entrySources.ts
 * exists to prevent -- and it would be a *silent* one here, because a wrong
 * matrix still renders as a matrix.
 */

import {
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
  typesInGeneration,
} from '../../data'
import type { Effectiveness, PokemonType, Species, Variety } from '../../data'
import { speciesEntries } from '../dex/entrySources'

/** A defending typing: one type, or two. Never more -- no Gen 1-4 species has three. */
export type TypeCombo = readonly PokemonType[]

/**
 * Stable identity for a combo, order-insensitive.
 *
 * Ground/Flying and Flying/Ground are ONE defensive typing -- slot order changes
 * nothing about what hits it -- so the key sorts before joining. Getting this
 * wrong would double every pair in the "all combinations" row set and would make
 * the existence lookup miss half the species that should match it.
 */
export function comboKey(combo: TypeCombo): string {
  return combo
    .map((t) => t.id)
    .sort((a, b) => a - b)
    .join('-')
}

/** Every single type that existed in this generation, in canonical order. */
export function singleCombos(generation: number): TypeCombo[] {
  return typesInGeneration(generation).map((t) => [t])
}

/**
 * Every single type plus every unordered PAIR: 17 + 136 = 153 rows in Gen 2-4,
 * 15 + 105 = 120 in Gen 1.
 *
 * `j = i + 1` is what makes the pairs unordered and also what excludes a type
 * paired with itself, which is not a typing.
 */
export function fullCombos(generation: number): TypeCombo[] {
  const types = typesInGeneration(generation)
  const combos: TypeCombo[] = types.map((t) => [t])
  for (let i = 0; i < types.length; i += 1) {
    for (let j = i + 1; j < types.length; j += 1) {
      combos.push([types[i], types[j]])
    }
  }
  return combos
}

/** The default form, which is the one whose typing a combination is counted from. */
function defaultVariety(species: Species): Variety | undefined {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

/**
 * Species holding each typing, keyed by `comboKey`, in dex order.
 *
 * SCOPED THROUGH `speciesEntries`, not `listSpecies`. The generation scope of
 * "which species exist" has one owner in this app and this is not it; a fresh
 * filter here is how a generation leak gets in, and it has happened before.
 *
 * The typing itself goes through `resolveTypesForGeneration`, so Magnemite is
 * Electric in Gen 1 and Electric/Steel from Gen 2 -- the reason a combination's
 * existence is a per-generation question at all rather than a fixed list.
 */
export function holdersByCombo(generation: number): Map<string, string[]> {
  const holders = new Map<string, string[]>()
  for (const species of speciesEntries({ generation, isAll: false })) {
    const variety = defaultVariety(species)
    if (!variety) continue
    const slots = resolveTypesForGeneration(variety, generation)
    if (slots.length === 0) continue
    const key = slots
      .map((s) => s.type_id)
      .sort((a, b) => a - b)
      .join('-')
    const list = holders.get(key)
    if (list) list.push(species.display_name)
    else holders.set(key, [species.display_name])
  }
  return holders
}

/**
 * Whether at least one real species has this typing in this generation.
 *
 * Note this is a question about SPECIES, not about the arithmetic: a combination
 * nothing has is still a legal defensive typing with real multipliers, which is
 * why the "All" state can show it rather than the row being meaningless.
 */
export function comboExists(combo: TypeCombo, holders: Map<string, string[]>): boolean {
  return (holders.get(comboKey(combo))?.length ?? 0) > 0
}

/**
 * How much damage each attacking type does to this defending typing.
 *
 * Straight through to the shared era resolver, which multiplies the relations of
 * both halves -- so 4x and 1/4x appear here and cannot appear in any view that
 * only ever asks about a single defending type.
 */
export function multipliersAgainst(combo: TypeCombo, generation: number): Effectiveness[] {
  return typeEffectivenessAgainst(
    combo.map((t) => t.id),
    generation,
  )
}

/**
 * The multiplier for one attacking type against one defending typing.
 *
 * Built from the row rather than from a second walk over the relations, for the
 * same no-second-derivation reason as everything else here.
 */
export function multiplierFor(
  attackingTypeId: number,
  combo: TypeCombo,
  generation: number,
): number {
  const row = multipliersAgainst(combo, generation)
  return row.find((e) => e.type.id === attackingTypeId)?.multiplier ?? 1
}

/**
 * How much damage this ATTACKING type does to each single defending type.
 *
 * The offensive direction, for Flow's right wing, Against's "safe to send" and
 * Card's "to" lines. Derived by transposing the defensive resolver rather than
 * reading `double_damage_to` -- one chart, read one way, so the two directions
 * cannot disagree.
 */
export function multipliersDealtBy(
  attackingType: PokemonType,
  generation: number,
): Effectiveness[] {
  return typesInGeneration(generation).map((defending) => ({
    type: defending,
    multiplier: multiplierFor(attackingType.id, [defending], generation),
  }))
}

/** Multiplier tiers, strongest first. 4x and 1/4x only occur against a dual typing. */
export const TIER_ORDER = [4, 2, 1, 0.5, 0.25, 0] as const

/** Display glyph for a multiplier. Fractions as real fraction characters. */
export function multiplierGlyph(multiplier: number): string {
  if (multiplier === 0.5) return '½'
  if (multiplier === 0.25) return '¼'
  return String(multiplier)
}

/** Multiplier as it reads in prose: "2x", "½x", "0x". */
export function multiplierLabel(multiplier: number): string {
  return `${multiplierGlyph(multiplier)}x`
}

/**
 * Group an effectiveness row into its non-neutral tiers, strongest first.
 *
 * 1x IS DROPPED, and that is the grouping decision MODULE-PATTERNS §5 asks for:
 * group by the axis with fewer buckets, and do not render an empty tier. Most of
 * a type's row is neutral, so listing the neutral bucket would bury the facts.
 */
export function groupByTier(row: Effectiveness[]): { multiplier: number; types: PokemonType[] }[] {
  return TIER_ORDER.filter((m) => m !== 1)
    .map((multiplier) => ({
      multiplier,
      types: row.filter((e) => e.multiplier === multiplier).map((e) => e.type),
    }))
    .filter((tier) => tier.types.length > 0)
}

/** Three-letter type abbreviation, for the Card view's narrow tiles. */
export function abbreviate(typeName: string): string {
  return typeName.slice(0, 3).toUpperCase()
}
