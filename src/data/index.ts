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
  captureRatePercent,
  damageRelationsFor,
  genderRatio,
  resolveAbilitiesForGeneration,
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

export { availableSpriteGenders, getSpriteUrl, usesUnsuffixedMaleSprite } from './sprites'
export type { SpriteGender, SpriteOptions } from './sprites'

export { DATA_DIR, EAGER_DATA_FILES, PARTITION_DIRS } from './manifest'
export type { EagerDataFile } from './manifest'

export type * from './types'
