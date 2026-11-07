/**
 * The entity-link engine: resolve a ref, name it, say where it opens, and find
 * what points at it.
 *
 * PURE. Every lookup goes through an injected `EntityContext`, so this file
 * imports nothing at runtime -- the suite (scripts/verify-entities.mjs) runs it
 * in Node against a literal fake, and the app hands it `appContext` (the real
 * data layer and the Collection store). Type-only imports are erased.
 */

import type { Ability, Item, LocationArea, Move, Species, VersionGroup } from '../../data/types'
import type { Trainer } from '../../data/trainers'
import type { CollectionEntry } from '../../modules/team-builder/model'
import type { NavLocation } from '../../modules/nav/navHistory'
import { refKey, type EntityKind, type EntityRef, type RefOf } from './ref'

/** What each kind resolves to. `playthrough` has no owner yet. */
export interface EntityMap {
  species: Species
  move: Move
  item: Item
  ability: Ability
  collectionEntry: CollectionEntry
  trainer: Trainer
  route: LocationArea
  game: VersionGroup
  playthrough: unknown
}

export interface KindResolver<K extends EntityKind> {
  /**
   * The entity, or null. With a generation, AS OF that generation: null when it
   * does not exist there, and the era's copy where the data layer has one (a
   * Gen 3 Fire Punch is special). Without one, unscoped.
   */
  get(ref: RefOf<K>, generation?: number): EntityMap[K] | null
  /** Display text for a resolved entity. */
  label(entity: EntityMap[K], ref: RefOf<K>, generation?: number): string
}

/**
 * One resolver per kind. A kind with no resolver resolves to null and labels
 * with its fallback -- which is how `playthrough` stays unresolvable until the
 * module that owns it registers one.
 */
export type EntityContext = { readonly [K in EntityKind]?: KindResolver<K> }

function resolverFor<K extends EntityKind>(
  ref: RefOf<K>,
  ctx: EntityContext,
): KindResolver<K> | undefined {
  return ctx[ref.kind as K] as KindResolver<K> | undefined
}

export function resolve<K extends EntityKind>(
  ref: RefOf<K>,
  ctx: EntityContext,
  generation?: number,
): EntityMap[K] | null {
  return resolverFor(ref, ctx)?.get(ref, generation) ?? null
}

/** What an unresolved ref reads as: honest about what it was, never blank. */
export function fallbackLabel(ref: EntityRef): string {
  switch (ref.kind) {
    case 'species':
      return `Species #${ref.id}`
    case 'move':
      return `Move #${ref.id}`
    case 'item':
      return `Item #${ref.id}`
    case 'ability':
      return `Ability #${ref.id}`
    case 'collectionEntry':
      return `Collection entry ${ref.id}`
    case 'trainer':
      return `Trainer ${ref.id} (${ref.game})`
    case 'route':
      return `Location #${ref.id}`
    case 'game':
      return `Game ${ref.id}`
    case 'playthrough':
      return `Playthrough ${ref.id}`
  }
}

export function label<K extends EntityKind>(
  ref: RefOf<K>,
  ctx: EntityContext,
  generation?: number,
): string {
  const r = resolverFor(ref, ctx)
  const entity = r?.get(ref, generation) ?? null
  return r && entity != null ? r.label(entity, ref, generation) : fallbackLabel(ref)
}

/**
 * Where the ref opens, as the location the nav already applies (navHistory's
 * `NavLocation`: page + numeric entry). Follow it with `followLink` in
 * appContext.ts: `nav.navigate(page, entry)` when there is an entry, otherwise
 * `nav.setModule(page)`.
 *
 * PAGE ONLY, entry null, where the nav cannot hold the entry today:
 *   - collectionEntry: the Collection is not a dex; its open entry is page state.
 *   - trainer: Trainer Dex rows key on an index WITHIN the game the page's own
 *     game row shows, which the nav cannot set -- an index without its game
 *     could open a different trainer.
 * NULL where there is no page: route (no location screen), game (a selector
 * value, not a page), playthrough (reserved).
 */
export function deepLink(ref: EntityRef): NavLocation | null {
  switch (ref.kind) {
    case 'species':
      return { page: 'pokedex', entry: ref.id }
    case 'move':
      return { page: 'movedex', entry: ref.id }
    case 'item':
      return { page: 'itemdex', entry: ref.id }
    case 'ability':
      return { page: 'abilitydex', entry: ref.id }
    case 'collectionEntry':
      return { page: 'collection', entry: null }
    case 'trainer':
      return { page: 'trainerdex', entry: null }
    case 'route':
    case 'game':
    case 'playthrough':
      return null
  }
}

export interface LinkSource<O = EntityRef | string> {
  owner: O
  refs: readonly EntityRef[]
}

/**
 * The owners whose refs include `target`, each once, in first-seen order. An
 * owner never lists itself.
 */
export function whatLinksHere<O extends EntityRef | string>(
  target: EntityRef,
  sources: readonly LinkSource<O>[],
): O[] {
  const want = refKey(target)
  const seen = new Set<string>()
  const out: O[] = []
  for (const { owner, refs } of sources) {
    const key = typeof owner === 'string' ? `s|${owner}` : `r|${refKey(owner)}`
    if (seen.has(key)) continue
    if (typeof owner !== 'string' && refKey(owner) === want) continue
    if (refs.some((r) => refKey(r) === want)) {
      seen.add(key)
      out.push(owner)
    }
  }
  return out
}
