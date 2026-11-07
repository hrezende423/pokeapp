/** The pure entity-link engine. The data-wired context is `./appContext`, imported separately. */

export {
  ENTITY_KINDS,
  formatRef,
  isValidRef,
  parseRef,
  refKey,
  sameRef,
  type EntityKind,
  type EntityRef,
  type RefOf,
} from './ref'
export {
  deepLink,
  fallbackLabel,
  label,
  resolve,
  whatLinksHere,
  type EntityContext,
  type EntityMap,
  type KindResolver,
  type LinkSource,
} from './engine'
