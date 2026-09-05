/**
 * Era-correct move TYPE: the type a move had in a given generation.
 *
 * THE RESOLVER EXISTS, BUT ALMOST NOTHING CALLS IT YET -- and that gap is the point
 * to keep in view. CLAUDE.md records the underlying bug: moves carry `past_values`
 * and nothing in the app reads it, so Charm, Sweet Kiss and Moonlight -- stored as
 * Fairy, a Generation 6 type, with a `past_values` entry giving Normal -- render as
 * FAIRY under every Gen 1-4 selection, and Curse renders as Ghost where it should
 * be ???. That affects the Movedex and every learnset table, not one screen.
 *
 * This file is the `resolveMoveTypeForGeneration` that note asks for, and it lives
 * here beside era.ts's resolveTypesForGeneration and resolveAbilitiesForGeneration
 * because era accuracy is a data-layer rule rather than one module's concern. It was
 * written for the Team Building legal-moveset function, which is still its only
 * caller: WIRING IT INTO THE MOVEDEX OR THE LEARNSET TAB IS A SEPARATE DECISION and
 * has deliberately not been made. Being reachable from src/data does not mean those
 * modules now go through it -- they still read `move.type_id` raw.
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
 * `version-groups.json` holds exactly the fourteen Gen 1-4 groups, so `x-y` and
 * `black-white` are absent by construction; looking them up returns undefined,
 * which read as "cannot place this entry" and fell straight back to the modern
 * type, so Charm still came out Fairy. But the bundle's own scope is the answer:
 * a group it does not carry is later than Generation 4, hence later than ANY build
 * this app can describe, so its past value is in force for every one of them.
 * Infinity says that without a table of Gen 5+ version groups to keep in sync --
 * and it still sorts behind a bundle-known entry, so a move retyped twice picks
 * the earlier change.
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
