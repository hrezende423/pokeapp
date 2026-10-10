/**
 * Era-correct move facts: the type, power, accuracy, PP, effect chance and
 * category a move had in a given generation.
 *
 * Moves carry `past_values`, and for a long time only Team Building and the
 * damage calculator read it, so Charm, Sweet Kiss and Moonlight -- stored as
 * Fairy, a Generation 6 type, with a `past_values` entry giving Normal -- rendered
 * as FAIRY in the Movedex and every learnset table under a Gen 1-4 selection.
 * `moveForGeneration` below is how the dexes read a move now (owner, 2026-10-10:
 * "make the dexes gen-aware"): `moveEntries` returns era-resolved copies, so the
 * Movedex's table, detail and filters all see the era's values without each one
 * resolving on its own.
 *
 * It lives here beside era.ts's resolveTypesForGeneration and
 * resolveAbilitiesForGeneration because era accuracy is a data-layer rule rather
 * than one module's concern.
 *
 * SEPARATE FROM era.ts ON PURPOSE, not by accident of history: era.ts resolves
 * SPECIES-scoped facts (a species' types, abilities and stats in an era), and this
 * resolves a MOVE-scoped one. `moveEra` therefore sits beside `moveDamage` and
 * `moveLearners`, which draw the same line.
 *
 * THE `past_values` SEMANTICS, since they are not obvious and getting them backwards
 * is silent. An entry's `version_group` is the group in which the NEW value took
 * effect, so the past value applies STRICTLY BEFORE that group's generation. All
 * eight type-changing moves in the bundle confirm it against known facts:
 *
 *   Karate Chop / Gust / Sand Attack / Bite -> `gold-silver`, past Normal.
 *       Normal in Gen 1, retyped in Gen 2. So Gen 1 reads Normal, Gen 2 does not.
 *   Curse -> `black-white`, past `unknown`.
 *       Type ??? in Gen 2-4, Ghost from Gen 5. So Gen 2-4 read ???, which is the
 *       era-accurate answer even though it looks like missing data.
 *   Charm / Sweet Kiss / Moonlight -> `x-y`, past Normal.
 *       Normal through Gen 5, Fairy from Gen 6. So all of Gen 1-4 read Normal.
 *
 * Hence: among the entries whose version group is LATER than the build's
 * generation, the earliest one holds the value in force then; with none, the move
 * has never been retyped since and the current value stands.
 */

import { getType, getVersionGroupByName } from './loader'
import type { Move } from './types'

/**
 * Generation a `past_values` entry's version group belongs to.
 *
 * A NAME THE BUNDLE DOES NOT CARRY IS NOT UNRESOLVABLE -- IT IS POST-SCOPE, and
 * getting this wrong is what made the first version of this file silently useless.
 * The bundle carries every version group through Gen 9 today, but a group newer
 * than the bundle is by construction later than any era the app can select, so
 * its past value is in force for every one of them. Infinity says that without a
 * table to keep in sync -- and it still sorts behind a bundle-known entry, so a
 * move retyped twice picks the earlier change.
 *
 * A group the bundle DOES carry but with a null generation stays unplaceable and
 * is skipped; that is a broken row, not a later era.
 */
function generationOfChange(versionGroup: string): number | null {
  const known = getVersionGroupByName(versionGroup)
  if (!known) return Number.POSITIVE_INFINITY
  return known.generation_id
}

/**
 * The `type_id` this move had in `generation`.
 *
 * Falls back to the move's current type when no past entry applies -- which is the
 * common case, and the value the rest of the app already shows.
 */
export function resolveMoveTypeIdForGeneration(move: Move, generation: number): number | null {
  let best: { generation: number; typeId: number } | null = null
  for (const past of move.past_values) {
    if (past.type_id == null || past.version_group == null) continue
    const changedIn = generationOfChange(past.version_group)
    if (changedIn == null || changedIn <= generation) continue
    if (!best || changedIn < best.generation) best = { generation: changedIn, typeId: past.type_id }
  }
  return best ? best.typeId : move.type_id
}

/** The resolved type's lowercase bundle name ('grass', 'unknown'), or null. */
export function resolveMoveTypeNameForGeneration(move: Move, generation: number): string | null {
  const typeId = resolveMoveTypeIdForGeneration(move, generation)
  return typeId == null ? null : (getType(typeId)?.name ?? null)
}

/**
 * `past_values` entries PokeAPI is missing, as era RULES (CLAUDE.md: "PokeAPI's
 * past_ arrays are incomplete"). Found by Team Matchup's suite diffing every move's
 * power against the disassemblies' move tables:
 *   Luster Purge is 70 in Gen 3-4 (pokeemerald src/data/battle_moves.h, pokeplatinum
 *   res/moves/luster_purge) and 95 now. Its twin Mist Ball carries exactly that
 *   entry (70 until scarlet-violet); Luster Purge carries none, so it read 95.
 */
const MISSING_PAST_POWER: Record<string, Move['past_values']> = {
  'luster-purge': [
    {
      accuracy: null,
      effect_chance: null,
      power: 70,
      pp: null,
      type_id: null,
      version_group: 'scarlet-violet',
    },
  ],
}

/**
 * The POWER this move had in `generation` -- the same `past_values` rule as the
 * type above, read off the `power` field instead.
 *
 * Written for the damage calculator, which is its only caller: a Gen 1 Dig is 100
 * and a Gen 2-3 one is 60 (entries `gold-silver=100`, `diamond-pearl=60`, the
 * earliest later-than-the-build entry winning), Tackle is 35 throughout Gen 1-4,
 * and Low Kick is a flat 50 before its Gen 3 weight rework. The Movedex and the
 * learnset tables still print the modern number; wiring this in there is the same
 * separate decision the type resolver's header describes.
 */
export function resolveMovePowerForGeneration(move: Move, generation: number): number | null {
  let best: { generation: number; power: number } | null = null
  for (const past of [...move.past_values, ...(MISSING_PAST_POWER[move.name] ?? [])]) {
    if (past.power == null || past.version_group == null) continue
    const changedIn = generationOfChange(past.version_group)
    if (changedIn == null || changedIn <= generation) continue
    if (!best || changedIn < best.generation) best = { generation: changedIn, power: past.power }
  }
  return best ? best.power : move.power
}

type PastField = 'power' | 'pp' | 'accuracy' | 'effect_chance' | 'type_id'

/**
 * The value `field` had in `generation`, by the same rule as the type and power
 * resolvers above: among the `past_values` entries that change THIS field (a null
 * means the entry left it alone) and took effect after the era, the earliest one
 * holds the value in force then.
 */
function resolvePastField(move: Move, field: PastField, generation: number): number | null {
  let best: { generation: number; value: number } | null = null
  for (const past of [...move.past_values, ...(MISSING_PAST_POWER[move.name] ?? [])]) {
    const value = past[field]
    if (value == null || past.version_group == null) continue
    const changedIn = generationOfChange(past.version_group)
    if (changedIn == null || changedIn <= generation) continue
    if (!best || changedIn < best.generation) best = { generation: changedIn, value }
  }
  return best ? best.value : move[field]
}

/**
 * Types whose damaging moves were PHYSICAL before the Gen 4 split. Until
 * Diamond/Pearl a move's category was its type's, not its own: Fire Punch was
 * special and Gust physical. Everything else damaging (Fire, Water, Grass,
 * Electric, Psychic, Ice, Dragon, Dark) was special. A known mechanic with a known
 * start generation, so it is a rule here rather than something the data carries.
 */
const PHYSICAL_TYPES_BEFORE_SPLIT = new Set([
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
])
const PHYSICAL_SPECIAL_SPLIT_GENERATION = 4

const resolved = new Map<number, WeakMap<Move, Move>>()

/**
 * The move as it was in `generation`: type, power, accuracy, PP, effect chance and
 * category resolved for that era, everything else as stored (`past_values`
 * included, so a detail page can still print the history).
 *
 * Returns the SAME object when nothing differs, and caches the copies per
 * generation, so a list rebuilt for the same era keeps stable identities.
 */
export function moveForGeneration(move: Move, generation: number): Move {
  let cache = resolved.get(generation)
  if (!cache) resolved.set(generation, (cache = new WeakMap()))
  const hit = cache.get(move)
  if (hit) return hit

  const type_id = resolveMoveTypeIdForGeneration(move, generation)
  let damage_class = move.damage_class
  if (
    generation < PHYSICAL_SPECIAL_SPLIT_GENERATION &&
    (damage_class === 'physical' || damage_class === 'special')
  ) {
    const typeName = type_id == null ? null : getType(type_id)?.name
    if (typeName && typeName !== 'unknown') {
      damage_class = PHYSICAL_TYPES_BEFORE_SPLIT.has(typeName) ? 'physical' : 'special'
    }
  }
  const next: Move = {
    ...move,
    type_id,
    damage_class,
    power: resolvePastField(move, 'power', generation),
    pp: resolvePastField(move, 'pp', generation),
    accuracy: resolvePastField(move, 'accuracy', generation),
    effect_chance: resolvePastField(move, 'effect_chance', generation),
  }
  const same =
    next.type_id === move.type_id &&
    next.damage_class === move.damage_class &&
    next.power === move.power &&
    next.pp === move.pp &&
    next.accuracy === move.accuracy &&
    next.effect_chance === move.effect_chance
  const out = same ? move : next
  cache.set(move, out)
  return out
}
