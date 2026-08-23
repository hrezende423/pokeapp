/**
 * The generation-scoped entry list behind every dex, in one place.
 *
 * Each function here IS the list its dex renders -- the module calls it and
 * renders the result, nothing more. That matters because the global search needs
 * the same lists, and the only safe way to guarantee it agrees with each dex is
 * to call the identical function rather than re-deriving the scoping rules
 * beside it.
 *
 * That is not hypothetical: the Abilitydex list was once clamped to the 123
 * abilities with a Generation 1-4 presence while a second code path still saw all
 * 161, so its own search box surfaced entries the list refused to show. A global
 * search over four entity types built the same way would reproduce that leak four
 * times over. Hence: one function per category, no second derivation anywhere.
 *
 * The scoping rules themselves live in data/availability.ts -- these functions
 * only apply them to a list.
 */

import {
  LATEST_GENERATION,
  abilityExistsInGeneration,
  berryExistsInGeneration,
  isSpeciesInGeneration,
  itemExistsInGeneration,
  listAbilities,
  listBerries,
  listItems,
  listMoves,
  listNatures,
  listSpecies,
  moveExistsInGeneration,
  naturesExistInGeneration,
} from '../../data'
import type { Ability, Berry, Item, Move, Nature, Species } from '../../data'

/**
 * Which era to scope to. `isAll` is not the same as "generation 4": it means the
 * user asked for no era filter, and each category answers that differently.
 */
export interface EntryScope {
  generation: number
  isAll: boolean
}

/**
 * Species in the dex for this era.
 *
 * `isAll` needs no special case: the provider reports LATEST_GENERATION for it,
 * and every species in scope exists by then, so the generation test already
 * yields the whole dex.
 */
export function speciesEntries({ generation }: EntryScope): Species[] {
  return listSpecies().filter((s) => isSpeciesInGeneration(s.id, generation))
}

/** Moves that existed by this era; under "All", every move in the bundle. */
export function moveEntries({ generation, isAll }: EntryScope): Move[] {
  const all = listMoves()
  return isAll ? all : all.filter((m) => moveExistsInGeneration(m, generation))
}

/** Items indexed in this era; under "All", every item in the bundle. */
export function itemEntries({ generation, isAll }: EntryScope): Item[] {
  const all = listItems()
  return isAll ? all : all.filter((i) => itemExistsInGeneration(i, generation))
}

/**
 * The abilities the Abilitydex is willing to list at all: the 123 with a
 * Generation 1-4 presence. The other 38 stay in the bundle so species ability
 * references never dangle (Gengar's modern Cursed Body, for one), but no in-scope
 * game has them, so the dex does not offer them.
 *
 * This clamp is the LIST's, not the data's: resolveAbilitiesForGeneration still
 * sees all 161, which is what keeps the species view correct.
 */
export function abilitiesInList(): Ability[] {
  return listAbilities().filter((a) => abilityExistsInGeneration(a, LATEST_GENERATION))
}

/** Abilities the bundle carries but the Abilitydex never lists. */
export function abilitiesHiddenFromList(): Ability[] {
  return listAbilities().filter((a) => !abilityExistsInGeneration(a, LATEST_GENERATION))
}

/** Abilities that existed by this era, within the clamped list. */
export function abilityEntries({ generation, isAll }: EntryScope): Ability[] {
  const inScope = abilitiesInList()
  return isAll ? inScope : inScope.filter((a) => abilityExistsInGeneration(a, generation))
}

/**
 * All 25 natures, or none: they arrived together in Generation 3 and none has
 * been added or removed since, so this is one rule rather than a per-entry test.
 */
export function natureEntries({ generation, isAll }: EntryScope): Nature[] {
  return isAll || naturesExistInGeneration(generation) ? listNatures() : []
}

/** Berries, availability derived from each berry's linked item. */
export function berryEntries({ generation, isAll }: EntryScope): Berry[] {
  const all = listBerries()
  return isAll ? all : all.filter((b) => berryExistsInGeneration(b, generation))
}
