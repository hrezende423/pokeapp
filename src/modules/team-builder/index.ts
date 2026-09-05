/**
 * Public surface of the Team Building module.
 *
 * Nothing outside this folder imports its files directly -- the Breeding Planner
 * is the second planned consumer of getLegalMoveset and should reach it here, so
 * the internal split between legalMoveset / lineage / tradeBlocks stays
 * free to change.
 */

export { EVENT_METHODS, getLegalMoveset } from './legalMoveset'
export type { BuildMovesetQuery, LegalMove, LegalMoveset, MoveSourceKind } from './legalMoveset'

export {
  TRADE_BLOCKS,
  tradeBlockForGeneration,
  versionGroupNamesInBlock,
  versionGroupsInBlock,
} from './tradeBlocks'
export type { TradeBlock, TradeBlockId } from './tradeBlocks'

export { lineageSpecies, lineageThroughStage } from './lineage'

/*
  The era-correct move-type resolver is NOT re-exported here. It used to live in
  this folder and moved to `src/data/moveEra.ts`, which is the project's home for
  shared, UI-independent derived data logic -- so it is the data layer's to export,
  not this module's, and a re-export would leave two paths to one function and imply
  Team Building owns it. Callers import '../../data/moveEra' directly, the same way
  Movedex reaches '../../data/moveDamage'.
*/
