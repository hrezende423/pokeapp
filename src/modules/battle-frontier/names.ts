import { getItem, getMove, getNature } from '../../data'
import { label } from '../../lib/entities'
import { appContext } from '../../lib/entities/appContext'
import { FRONTIER_GENERATION } from './data'

/** Names as the mockups print them: the eager bundle's display names. */

/**
 * A species' name through the entity-link engine, scoped to Gen 3. ONE argument on
 * purpose: callers pass it to `.map`, whose index must never reach the generation.
 */
export const speciesName = (id: number): string => label({ kind: 'species', id }, appContext, FRONTIER_GENERATION)

/** The same, scoped to another generation (Gen 4 screens). */
export const speciesNameIn = (id: number, generation: number): string =>
  label({ kind: 'species', id }, appContext, generation)

export const moveNames = (ids: number[]): string =>
  ids.map((id) => getMove(id)?.display_name ?? `move ${id}`).join(' · ')

export const itemName = (id: number | null | undefined): string =>
  id == null ? '—' : (getItem(id)?.display_name ?? `item ${id}`)

export const natureName = (id: number | null | undefined): string =>
  id == null ? '—' : (getNature(id)?.display_name ?? '—')
