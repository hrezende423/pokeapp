/**
 * "Did this thing exist yet?" per entity kind, for the selected generation.
 *
 * Each kind gets its own rule because the bundle carries a different (or no)
 * generation signal for each. What follows is what the data actually supports --
 * audited, not assumed:
 *
 *   ABILITIES  `generation_id`, a single integer, on every one of the 161
 *              entries. Cumulative: `generation_id <= G`. Gens 1-2 yield none at
 *              all, matching resolveAbilitiesForGeneration.
 *
 *   ITEMS      `generation_ids`, an array built from PokeAPI's `game_indices` --
 *              a real per-generation item-index table, one entry per generation
 *              the item is indexed in. All 563 items have a non-empty array.
 *
 *              It is deliberately treated as a SET, not a range: 61 items have
 *              genuine gaps, and the gaps are historically correct. Safari Ball
 *              is [1,3,4,...] -- absent from Gen 2, which had no Safari Zone
 *              ball; TM51-55 are [1,4,...] because the Gen 2-3 TM lists did not
 *              include those numbers. `min <= G` would wrongly show a Safari Ball
 *              in Gold/Silver, so membership is the test.
 *
 *   BERRIES    No generation field of their own. Every one of the 64 berries has
 *              an `item_id` that resolves in items.json, so availability is
 *              DERIVED from the linked item's `generation_ids`. That is a join
 *              over data already in the bundle, not an invented field, but it is
 *              second-hand and labelled as such in the UI.
 *
 *   NATURES    No per-entry signal, and correctly so: all 25 arrived together in
 *              Gen 3 and none has ever been added or removed. So there is nothing
 *              to gate per entry -- the whole list is gated by one rule.
 */

import { getItem } from './loader'
import type { Ability, Berry, Item, Move } from './types'

/** Natures were introduced wholesale in Gen 3. */
export const NATURES_INTRODUCED_IN_GENERATION = 3

/** Whether natures existed at all in `generation`. */
export function naturesExistInGeneration(generation: number): boolean {
  return generation >= NATURES_INTRODUCED_IN_GENERATION
}

/**
 * Abilities are cumulative: one introduced in Gen 4 exists in Gen 4 onward.
 * A missing `generation_id` is treated as "later than anything in scope" rather
 * than as Gen 1, so an unknown never leaks into an early-game list.
 */
export function abilityExistsInGeneration(ability: Ability, generation: number): boolean {
  return (ability.generation_id ?? 99) <= generation
}

/**
 * Moves are cumulative, like abilities: one introduced in Gen 4 exists in Gen 4
 * onward. `generation_id` is present on all 485 in-scope moves. A missing value is
 * treated as later-than-scope so an unknown never leaks into an early-game list.
 */
export function moveExistsInGeneration(move: Move, generation: number): boolean {
  return (move.generation_id ?? 99) <= generation
}

/** Membership, not a range -- see the note above about Safari Ball and TM51-55. */
export function itemExistsInGeneration(item: Item, generation: number): boolean {
  return item.generation_ids.includes(generation)
}

/**
 * Derived from the berry's linked item. A berry whose item cannot be resolved is
 * reported as absent rather than silently shown, so a broken join can never
 * masquerade as availability.
 */
export function berryExistsInGeneration(berry: Berry, generation: number): boolean {
  if (berry.item_id == null) return false
  const item = getItem(berry.item_id)
  return item ? itemExistsInGeneration(item, generation) : false
}
