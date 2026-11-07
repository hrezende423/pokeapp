/**
 * The app's EntityContext: the engine's resolvers wired to the real data layer
 * and the Collection store. Not tested in Node (it needs the bundle); the pure
 * engine is, against a fake (scripts/verify-entities.mjs).
 *
 * GENERATION-SCOPED THROUGH THE DEX'S OWN LISTS. With a generation, species,
 * moves, items and abilities resolve through `entrySources.ts` -- the functions
 * each dex renders -- never a second derivation of the era rules, so a ref
 * resolves exactly when its dex would list it, and a move resolves to its era's
 * copy. Each list is indexed once per generation.
 *
 * Nothing resolves before the data layer is ready (null, so labels fall back).
 * A trainer resolves only once its game's partition is loaded (`peekTrainers`):
 * resolving never triggers a fetch.
 */

import {
  getAbility,
  getItem,
  getLocationArea,
  getMove,
  getSpecies,
  getVersionGroupByName,
  isDataLayerReady,
} from '../../data'
import { peekTrainers, trainerLabel } from '../../data/trainers'
import {
  abilityEntries,
  itemEntries,
  moveEntries,
  speciesEntries,
} from '../../modules/dex/entrySources'
import { isDexId } from '../../modules/nav/navConfig'
import type { NavState } from '../../modules/nav/navContext'
import type { NavLocation } from '../../modules/nav/navHistory'
import { readData } from '../../modules/team-builder/store'
import { gameLabel, gamesInGeneration } from '../../modules/version-group/games'
import type { EntityContext } from './engine'

const scopedIndex = new Map<string, Map<number, unknown>>()

/** One generation's dex list, by id, built on first ask. */
function scoped<T extends { id: number }>(
  kind: string,
  generation: number,
  list: (scope: { generation: number; isAll: boolean }) => T[],
): Map<number, T> {
  const key = `${kind}:${generation}`
  let index = scopedIndex.get(key)
  if (!index) {
    index = new Map(list({ generation, isAll: false }).map((e) => [e.id, e]))
    scopedIndex.set(key, index)
  }
  return index as Map<number, T>
}

function dexLookup<T extends { id: number; display_name: string }>(
  kind: string,
  get: (id: number) => T | undefined,
  list: (scope: { generation: number; isAll: boolean }) => T[],
) {
  return {
    get: ({ id }: { id: number }, generation?: number): T | null => {
      if (!isDataLayerReady()) return null
      if (generation == null) return get(id) ?? null
      return scoped(kind, generation, list).get(id) ?? null
    },
    label: (e: T) => e.display_name,
  }
}

export const appContext: EntityContext = {
  species: dexLookup('species', getSpecies, speciesEntries),
  move: dexLookup('move', getMove, moveEntries),
  item: dexLookup('item', getItem, itemEntries),
  ability: dexLookup('ability', getAbility, abilityEntries),

  /* The Collection follows the global selector: another generation's entry is not a row. */
  collectionEntry: {
    get: ({ id }, generation) => {
      const entry = (readData().collection ?? []).find((c) => c.id === id) ?? null
      if (!entry || (generation != null && entry.generation !== generation)) return null
      return entry
    },
    label: (e) =>
      e.nickname.trim() ||
      (isDataLayerReady() ? getSpecies(e.speciesId)?.display_name : undefined) ||
      `Collection entry ${e.id}`,
  },

  trainer: {
    get: ({ game, id }, generation) => {
      const partition = peekTrainers(game)
      if (!partition || (generation != null && partition.generation !== generation)) return null
      return partition.trainers.find((t) => t.id === id) ?? null
    },
    label: (t, { game }) => {
      const className = peekTrainers(game)?.classes[t.class_id]?.name ?? t.class_id
      return trainerLabel(className, t.name)
    },
  },

  /* No generation-scoped location list exists: areas resolve unscoped. */
  route: {
    get: ({ id }) => (isDataLayerReady() ? (getLocationArea(id) ?? null) : null),
    label: (a) => a.display_name,
  },

  /* A game is in a generation's list or not: the game rows cannot leave it either. */
  game: {
    get: ({ id }, generation) => {
      if (!isDataLayerReady()) return null
      if (generation == null) return getVersionGroupByName(id) ?? null
      return gamesInGeneration(generation).find((v) => v.name === id) ?? null
    },
    label: (v) => gameLabel(v.name),
  },
}

/** Open a `deepLink` target through the nav, the way the global search does. */
export function followLink(target: NavLocation, nav: Pick<NavState, 'navigate' | 'setModule'>) {
  if (target.entry != null && isDexId(target.page)) nav.navigate(target.page, target.entry)
  else nav.setModule(target.page)
}
