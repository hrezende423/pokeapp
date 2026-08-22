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
  listVersionGroups,
  __resetDataLayer,
} from './loader'
export type { BootStats, FileLoadStat } from './loader'

export {
  getEncountersForSpecies,
  getLearnsetsForSpecies,
  getVersionGroupStats,
  isVersionGroupLoaded,
  loadVersionGroupData,
  loadedVersionGroups,
  peekLearnsetsForSpecies,
  __resetVersionGroupCache,
} from './versionGroupData'
export type { VersionGroupData, VersionGroupLoadStats } from './versionGroupData'

export { DATA_DIR, EAGER_DATA_FILES, PARTITION_DIRS } from './manifest'
export type { EagerDataFile } from './manifest'

export type * from './types'
