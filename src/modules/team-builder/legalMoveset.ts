/**
 * The legal moveset for one build: every move it could have, given its species and
 * evolution stage, its level, and its generation.
 *
 * WHAT CONSUMES IT. The Team Building move dropdown is the first caller and the
 * Breeding Planner is the second, so this is a data-layer function and not a hook:
 * no React, no context, no component state. It reads the bundle through
 * `src/data` and returns a plain deduplicated list. A hook that wants LoadState
 * semantics wraps this; it does not live inside it.
 *
 * READ-ONLY OVER POKEPEDIA'S DATA. Learnsets, evolution chains, species, moves and
 * types are all read through the existing `src/data` accessors -- the same
 * partitioned per-version-group files the species Learnset tab reads. Nothing here
 * re-ingests, duplicates or reshapes any of it.
 *
 * THE FIVE SOURCES IT UNIONS, and the two axes each one unions over:
 *
 *   1. Level-up  -- lineage: base stage .. build's stage. Level-gated in GEN 1 ONLY.
 *   2. Egg       -- lineage. Absent in Gen 1: breeding does not exist yet.
 *   3. TM / HM   -- lineage.
 *   4. Tutor     -- lineage.
 *   5. Event     -- lineage, and flagged `is_event` so the UI can asterisk it.
 *
 * Every one of them ALSO unions over every version group in the build's trade
 * block, never just the group its generation names -- see ./tradeBlocks.ts for why
 * that is the whole point rather than a detail.
 *
 * THE GEN 1 / GEN 2-4 SPLIT ON LEVEL IS THE SUBTLE PART, and it is a rule about
 * breeding, not about levels. From Gen 2 a father passes its own moves to the egg,
 * so a level-3 hatchling can already know a move its species learns at level 46 --
 * the father simply had to have reached 46 first. Any level-up move the stage can
 * ever learn is therefore legal at any level, and gating by the build's level would
 * hide legal moves. Gen 1 has no breeding at all, so there is no way to know a move
 * early and the gate is real: level <= the build's level, taking the LOWEST level
 * offered anywhere in the block (Bulbasaur's Vine Whip is level 13 in Red/Blue but
 * level 10 in Gold/Silver, and Gold/Silver trades back through the Time Capsule).
 *
 * THE EGG-MOVE SIMPLIFICATION IS DELIBERATE AND MUST STAY. Every egg move found
 * anywhere in the lineage counts, with no egg-group compatibility test, no
 * father-can-actually-learn-it test and no multi-egg-move stacking test. Real
 * chain-breeding feasibility is the Breeding Planner's job; this function
 * answers "could this move be on this build at all", which is the question a move
 * dropdown asks.
 *
 * PARTIAL FAILURES ARE NAMED, NEVER DROPPED, per the partition discipline in
 * MODULE-PATTERNS.md section 6: a block whose Emerald file failed returns its
 * moves plus `failed: ['emerald']`, so a caller can say so instead of presenting a
 * short list as complete. Only a total failure throws, because zero groups loaded
 * is an error and not an empty result.
 */

import { getLearnsetsForSpecies, getMove } from '../../data'
import type { LearnRow, Move } from '../../data'
import { BREEDING_INTRODUCED_IN_GENERATION } from '../dex/entrySources'
import { lineagePokemonIds, lineageThroughStage } from './lineage'
import {
  resolveMoveTypeIdForGeneration,
  resolveMoveTypeNameForGeneration,
} from '../../data/moveEra'
import { tradeBlockForGeneration, versionGroupsInBlock } from './tradeBlocks'
import type { TradeBlock } from './tradeBlocks'

/**
 * How a move is reached. The four standard buckets are the bundle's own method
 * names; `event` collapses everything else -- see EVENT_METHODS.
 */
export type MoveSourceKind = 'level-up' | 'egg' | 'machine' | 'tutor' | 'event'

/**
 * The bundle's non-standard learn methods, all of which land in the `event` bucket.
 *
 * These are real rows and dropping them silently would be worse than an unfamiliar
 * label -- the same call the species Learnset tab makes for the same rows:
 *
 *   stadium-surfing-pikachu  Surfing Pikachu, a Pokemon Stadium distribution.
 *   light-ball-egg           Volt Tackle, from breeding a Light-Ball Pikachu.
 *   xd-purification          what a Shadow Pokemon relearns on purification in XD.
 *   form-change              Rotom's per-form move, only had while in that form.
 *
 * WHICH EVENT IT WAS IS DELIBERATELY NOT TRACKED. The brief asks for an asterisk,
 * not a provenance note, so a boolean is the whole requirement; `methods` still
 * carries the raw method names for anyone who wants more later.
 *
 * ANY UNRECOGNISED METHOD ALSO LANDS HERE, which is the fail-safe direction: a
 * method added to the bundle later surfaces with an asterisk rather than vanishing
 * from the dropdown.
 */
export const EVENT_METHODS = [
  'stadium-surfing-pikachu',
  'light-ball-egg',
  'xd-purification',
  'form-change',
] as const

const STANDARD_METHODS: Record<string, MoveSourceKind | undefined> = {
  'level-up': 'level-up',
  egg: 'egg',
  machine: 'machine',
  tutor: 'tutor',
}

/** One move, everything a dropdown row needs, plus where it came from. */
export interface LegalMove {
  move_id: number
  /** Display name, ready to render. */
  name: string
  /**
   * Type NAME for the build's generation, lowercase as the bundle stores it
   * ('grass'), resolved through src/data/moveEra.ts rather than read raw. Null only
   * if the bundle has no type for the move.
   */
  type: string | null
  type_id: number | null
  /** 'physical' | 'special' | 'status' as the bundle stores it, or null. */
  category: string | null
  /** True when the ONLY way to it is an event/special distribution. Render an asterisk. */
  is_event: boolean
  /** Every source kind that reaches it, in the canonical order above. */
  sources: MoveSourceKind[]
  /** Raw bundle method names, for a caller that wants the specific event. */
  methods: string[]
  /** Lineage stages that supply it, base first. */
  species_ids: number[]
  /** Version groups in the block that supply it. */
  version_groups: string[]
  /**
   * Lowest level-up level offered anywhere in the block, or null when the move is
   * not a level-up move for any stage. This is what the Gen 1 gate compares, and
   * it is also the sort key a "by level" dropdown wants.
   */
  min_level: number | null
}

export interface BuildMovesetQuery {
  /** The build's CURRENT evolution stage, not its base stage. */
  speciesId: number
  /** The build's current level. Only read for a Gen 1 build -- see the header. */
  level: number
  /** 1-4. Selects the trade block; outside that range throws. */
  generation: number
  /**
   * Form to read the build's own stage as, when it is not the default one.
   * Ancestors are always read at their default form.
   */
  pokemonId?: number
}

export interface LegalMoveset {
  species_id: number
  level: number
  generation: number
  tradeBlock: TradeBlock
  /** Version groups actually unioned, release order. */
  versionGroups: string[]
  /** Base stage first, build's stage last. */
  lineage: number[]
  /** Deduplicated: one entry per move however many sources reach it. */
  moves: LegalMove[]
  /** Version groups whose partition could not be loaded. Empty on a clean read. */
  failed: string[]
}

const SOURCE_ORDER: MoveSourceKind[] = ['level-up', 'egg', 'machine', 'tutor', 'event']

/** Mutable accumulator, one per move id, collapsed into a LegalMove at the end. */
interface Accumulator {
  moveId: number
  sources: Set<MoveSourceKind>
  methods: Set<string>
  speciesIds: Set<number>
  versionGroups: Set<string>
  minLevel: number | null
}

/**
 * Whether this row's method is admissible for the build at all.
 *
 * Returns the bucket to file it under, or null to skip the row. The two rules that
 * can reject a row live here together on purpose -- they are the only two places
 * the build's generation and level change the answer:
 *
 *   - an egg row in a generation with no breeding is not a move, it is an anachronism;
 *   - a level-up row above the build's level is out of reach in Gen 1 only.
 */
function bucketFor(row: LearnRow, generation: number, level: number): MoveSourceKind | null {
  const standard = STANDARD_METHODS[row.method]
  if (standard === 'egg') {
    return generation >= BREEDING_INTRODUCED_IN_GENERATION ? 'egg' : null
  }
  if (standard === 'level-up') {
    // Level 0 does not occur in the bundle today; treated as always-available
    // rather than as "0 <= level", which is the same answer but survives a future
    // row that uses 0 to mean "known on arrival".
    if (generation === 1 && row.level > 0 && row.level > level) return null
    return 'level-up'
  }
  return standard ?? 'event'
}

function accumulate(acc: Map<number, Accumulator>, row: LearnRow, kind: MoveSourceKind): void {
  let entry = acc.get(row.move_id)
  if (!entry) {
    entry = {
      moveId: row.move_id,
      sources: new Set(),
      methods: new Set(),
      speciesIds: new Set(),
      versionGroups: new Set(),
      minLevel: null,
    }
    acc.set(row.move_id, entry)
  }
  entry.sources.add(kind)
  entry.methods.add(row.method)
  entry.speciesIds.add(row.species_id)
  entry.versionGroups.add(row.version_group)
  if (kind === 'level-up' && row.level > 0) {
    entry.minLevel = entry.minLevel == null ? row.level : Math.min(entry.minLevel, row.level)
  }
}

/**
 * Collapse an accumulator into a render-ready row.
 *
 * `is_event` is "event and nothing else", not "event at all": a move an event also
 * happens to give but a TM gives too needs no asterisk, because the build can just
 * use the TM. Only the moves with no ordinary route get marked.
 *
 * `species_ids` and `version_groups` are re-ordered against the caller's own lists
 * rather than emitted in Set insertion order, so provenance reads base-stage-first
 * and release-order however the rows happened to arrive.
 */
function toLegalMove(
  entry: Accumulator,
  lineage: number[],
  groupNames: string[],
  generation: number,
): LegalMove {
  const move: Move | undefined = getMove(entry.moveId)
  const sources = SOURCE_ORDER.filter((kind) => entry.sources.has(kind))
  return {
    move_id: entry.moveId,
    name: move?.display_name ?? `#${entry.moveId}`,
    type: move ? resolveMoveTypeNameForGeneration(move, generation) : null,
    type_id: move ? resolveMoveTypeIdForGeneration(move, generation) : null,
    category: move?.damage_class ?? null,
    is_event: sources.length === 1 && sources[0] === 'event',
    sources,
    methods: [...entry.methods].sort(),
    species_ids: lineage.filter((id) => entry.speciesIds.has(id)),
    version_groups: groupNames.filter((name) => entry.versionGroups.has(name)),
    min_level: entry.minLevel,
  }
}

/**
 * Every move legal for this build, deduplicated.
 *
 * Sorted by name, which is the order a searchable dropdown wants; a caller sorting
 * by level or type has `min_level` and `type` to sort on without re-deriving
 * anything.
 *
 * THROWS on a generation outside 1-4 (a caller bug -- see tradeBlockForGeneration)
 * and on a total partition failure. A species the bundle does not carry is NOT an
 * error: the lineage falls back to the species alone and no rows match, so the
 * result is a legitimately empty `moves`.
 */
export async function getLegalMoveset({
  speciesId,
  level,
  generation,
  pokemonId,
}: BuildMovesetQuery): Promise<LegalMoveset> {
  const tradeBlock = tradeBlockForGeneration(generation)
  const groups = versionGroupsInBlock(generation)
  const groupNames = groups.map((g) => g.name)
  const lineage = lineageThroughStage(speciesId)
  const pokemonIds = lineagePokemonIds(speciesId, pokemonId)

  /*
    One request per (stage, version group). getLearnsetsForSpecies de-duplicates
    in-flight loads and indexes each file once per session, so the stages of a
    three-stage line share one fetch per group rather than three, and a second
    build in the same block costs nothing.
  */
  const requests = groups.flatMap((group) =>
    lineage.map(async (stageId) => getLearnsetsForSpecies(stageId, group.name)),
  )
  const settled = await Promise.allSettled(requests)

  const acc = new Map<number, Accumulator>()
  const failed = new Set<string>()
  settled.forEach((result, i) => {
    // requests is built group-major, so integer division recovers the group a
    // rejected request belonged to -- which is the name the caller has to report.
    if (result.status !== 'fulfilled') {
      failed.add(groupNames[Math.floor(i / lineage.length)])
      return
    }
    for (const row of result.value) {
      if (!pokemonIds.has(row.pokemon_id)) continue
      const kind = bucketFor(row, generation, level)
      if (kind) accumulate(acc, row, kind)
    }
  })

  if (failed.size === groups.length) {
    throw new Error(
      `no learnset partition in the ${tradeBlock.label} trade block could be loaded ` +
        `(${failed.size} version groups failed)`,
    )
  }

  const moves = [...acc.values()]
    .map((entry) => toLegalMove(entry, lineage, groupNames, generation))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    species_id: speciesId,
    level,
    generation,
    tradeBlock,
    versionGroups: groupNames,
    lineage,
    moves,
    failed: groupNames.filter((name) => failed.has(name)),
  }
}
