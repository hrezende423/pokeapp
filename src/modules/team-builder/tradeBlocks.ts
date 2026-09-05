/**
 * The trade blocks, and which version groups a build may draw data from.
 *
 * IN-GAME TRADING SPANS GENERATIONS, BUT ONLY INSIDE TWO FIXED BLOCKS, and the
 * blocks never touch each other:
 *
 *   Block A -- Generations 1-2 (Time Capsule: Red/Blue/Yellow <-> Gold/Silver/Crystal)
 *   Block B -- Generations 3-4 (GBA <-> GBA, and Pal Park from GBA into DS)
 *
 * Nothing crosses from A to B: a Gen 2 Bulbasaur cannot reach Ruby/Sapphire, and a
 * Gen 3 one cannot reach Gold/Silver. So "what could this build legally know" is a
 * question about a BLOCK, not about the one version group the build's generation
 * names -- a Gen 3 build may have learnt a move from a Gen 4 tutor and been traded
 * back, and an Emerald tutor move is reachable by a Ruby/Sapphire build.
 *
 * That is why every union in ./legalMoveset.ts runs over `versionGroupsInBlock`
 * rather than over one group. Reaching for a single version group here is the bug
 * this module exists to prevent.
 *
 * THE GROUPS COME FROM THE BUNDLE, never from a hardcoded name list: the data layer
 * already knows all fourteen and their generations, so adding a version group to
 * the bundle extends the right block on its own. The two ranges below are the only
 * fact this file states, because they are a property of the hardware, not the data.
 */

import { listVersionGroups } from '../../data'
import type { VersionGroup } from '../../data'

/** A block's identity, as the UI would name it. */
export type TradeBlockId = 'gen1-2' | 'gen3-4'

export interface TradeBlock {
  id: TradeBlockId
  label: string
  /** Generations whose games can trade with each other. */
  generations: readonly number[]
}

export const TRADE_BLOCKS: readonly TradeBlock[] = [
  { id: 'gen1-2', label: 'Generation 1-2', generations: [1, 2] },
  { id: 'gen3-4', label: 'Generation 3-4', generations: [3, 4] },
] as const

/**
 * The block a build's generation belongs to.
 *
 * Throws rather than guessing: a generation outside 1-4 is a caller bug, and
 * silently answering "Block B" for a Gen 5 build would union the wrong games and
 * look like a data problem later.
 */
export function tradeBlockForGeneration(generation: number): TradeBlock {
  const block = TRADE_BLOCKS.find((b) => b.generations.includes(generation))
  if (!block) {
    throw new Error(
      `generation ${generation} is outside the app's Gen 1-4 scope, so no trade block applies`,
    )
  }
  return block
}

/**
 * Every version group a build in this generation may draw learnset data from,
 * oldest first.
 *
 * Ordered by the bundle's own `order` so the provenance lists a caller reads back
 * ("this move comes from gold-silver, crystal") are in release order rather than
 * id order -- the same ordering rule getEncountersForSpeciesAllGames relies on.
 */
export function versionGroupsInBlock(generation: number): VersionGroup[] {
  const { generations } = tradeBlockForGeneration(generation)
  return listVersionGroups()
    .filter((vg) => vg.generation_id != null && generations.includes(vg.generation_id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Version-group names in the block, oldest first. Convenience for callers/tests. */
export function versionGroupNamesInBlock(generation: number): string[] {
  return versionGroupsInBlock(generation).map((vg) => vg.name)
}
