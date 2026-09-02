/** Public surface of the data layer. */

export {
  dataUrl,
  eagerFiles,
  getAbility,
  getBerry,
  getBootStats,
  getBundleMeta,
  getDamageRelations,
  getEggGroup,
  getEvolutionChain,
  getIndexCounts,
  getItem,
  getLocation,
  getLocationArea,
  getMove,
  getNature,
  getSpecies,
  getType,
  getVersionGroup,
  getVersionGroupByName,
  initDataLayer,
  isDataLayerReady,
  listAbilities,
  listBerries,
  listEggGroups,
  listItems,
  listMoves,
  listNatures,
  listSpecies,
  listTypes,
  listVersionGroups,
  __resetDataLayer,
} from './loader'
export type { BootStats, FileLoadStat } from './loader'

export {
  getEncountersForSpecies,
  getLearnsetsForSpecies,
  getVersionGroupStats,
  isVersionGroupLoaded,
  areAllLearnsetsLoaded,
  learnsetRowsForVersionGroup,
  loadAllLearnsets,
  loadEncounters,
  loadLearnsets,
  loadVersionGroupData,
  loadedVersionGroups,
  peekLearnsetsForSpecies,
  __resetVersionGroupCache,
} from './versionGroupData'
export type {
  PartitionLoadStats,
  VersionGroupData,
  VersionGroupLoadStats,
} from './versionGroupData'

export {
  ABILITIES_INTRODUCED_IN_GENERATION,
  EFFORT_VALUES_INTRODUCED_IN_GENERATION,
  HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION,
  captureRatePercent,
  damageRelationsFor,
  genderRatio,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
  typesInGeneration,
} from './era'
export type { Effectiveness, ResolvedAbility } from './era'

export {
  GENERATION_RANGES,
  LATEST_GENERATION,
  MAX_SPECIES_ID,
  generationTag,
  getGenerationForSpecies,
  getRegionForSpecies,
  isSpeciesInGeneration,
} from './generations'
export type { GenerationRange } from './generations'

export {
  ARTWORK_MODES,
  DEFAULT_ARTWORK_VIEW,
  artworkMode,
  evolutionThumbUrl,
  genderAvailable,
  genderAvailableIn,
  motionAvailable,
  resolveArtworkUrl,
} from './artwork'
export type {
  ArtworkGender,
  ArtworkMode,
  ArtworkMotion,
  ArtworkSource,
  ArtworkView,
} from './artwork'

export {
  NATURES_INTRODUCED_IN_GENERATION,
  abilityExistsInGeneration,
  berryExistsInGeneration,
  itemExistsInGeneration,
  moveExistsInGeneration,
  naturesExistInGeneration,
} from './availability'

export { learnersAcrossVersionGroups, learnersInVersionGroup } from './moveLearners'
export type { MoveLearner } from './moveLearners'

export { speciesWithAbility } from './abilityHolders'
export type { AbilityHolder } from './abilityHolders'

export { availableSpriteGenders, getSpriteUrl, usesUnsuffixedMaleSprite } from './sprites'
export type { SpriteGender, SpriteOptions } from './sprites'
export {
  BW_FIRST_ID,
  BW_LAST_ID,
  bwAnimatedCount,
  bwAnimatedTiles,
  bwAnimatedUrl,
  hasBwAnimated,
} from './animatedSprites'
export type { BwSlot, BwTile } from './animatedSprites'

export {
  SLOT_ORDER,
  SPRITE_GAMES,
  hasSlot,
  slotLabel,
  slotsFor,
  spriteTiles,
  versionSpriteUrl,
} from './spriteSlots'
export type { SpriteSlot, SpriteTile } from './spriteSlots'

export { DATA_DIR, EAGER_DATA_FILES, PARTITION_DIRS } from './manifest'
export type { EagerDataFile } from './manifest'

export type * from './types'
