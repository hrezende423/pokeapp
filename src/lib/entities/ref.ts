/**
 * A typed pointer at one thing the app knows about, and its stable string form.
 *
 * The string is what a later module stores (a journal note's links, a
 * playthrough's checklist) and what `whatLinksHere` compares, so it must
 * round-trip exactly: `parseRef(formatRef(r))` deep-equals `r`, and a string
 * that is not canonical (a leading zero, a stray space) parses to null rather
 * than to a second spelling of the same ref.
 *
 *   species:25                          a species, by national dex id
 *   move:85 / item:1 / ability:65       by bundle id
 *   collectionEntry:c12                 a Collection entry, by its stored id
 *   trainer:platinum/TRAINER_CHAMPION_CYNTHIA
 *                                       a story trainer: version group + the
 *                                       disassembly's own id (case kept)
 *   route:1                             a location AREA, by its bundle id
 *   game:platinum                       a version group, by name
 *   playthrough:<id>                    reserved for a later module
 */

export const ENTITY_KINDS = [
  'species',
  'move',
  'item',
  'ability',
  'collectionEntry',
  'trainer',
  'route',
  'game',
  'playthrough',
] as const

export type EntityKind = (typeof ENTITY_KINDS)[number]

export type EntityRef =
  | { kind: 'species'; id: number }
  | { kind: 'move'; id: number }
  | { kind: 'item'; id: number }
  | { kind: 'ability'; id: number }
  | { kind: 'collectionEntry'; id: string }
  | { kind: 'trainer'; game: string; id: string }
  | { kind: 'route'; id: number }
  | { kind: 'game'; id: string }
  | { kind: 'playthrough'; id: string }

export type RefOf<K extends EntityKind> = Extract<EntityRef, { kind: K }>

/** Canonical positive integer: no sign, no leading zero, no exponent. */
const NUMERIC = /^[1-9]\d{0,8}$/
/** A version group name: "platinum", "heartgold-soulsilver". */
const GAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** The disassembly's trainer id: TRAINER_LEADER_ROARK, RIVAL1_3. */
const TRAINER_ID = /^[A-Za-z0-9_]+$/
/** A stored record id: Collection's "c12", a future playthrough's. */
const RECORD_ID = /^[A-Za-z0-9_-]+$/

const NUMERIC_KINDS: ReadonlySet<EntityKind> = new Set(['species', 'move', 'item', 'ability', 'route'])

const isKind = (k: string): k is EntityKind => (ENTITY_KINDS as readonly string[]).includes(k)

/** True when `ref` has a canonical string form. */
export function isValidRef(ref: EntityRef): boolean {
  if (!ref || typeof ref !== 'object' || !isKind(ref.kind)) return false
  switch (ref.kind) {
    case 'species':
    case 'move':
    case 'item':
    case 'ability':
    case 'route':
      return Number.isSafeInteger(ref.id) && NUMERIC.test(String(ref.id))
    case 'collectionEntry':
    case 'playthrough':
      return typeof ref.id === 'string' && RECORD_ID.test(ref.id)
    case 'trainer':
      return (
        typeof ref.game === 'string' &&
        GAME.test(ref.game) &&
        typeof ref.id === 'string' &&
        TRAINER_ID.test(ref.id)
      )
    case 'game':
      return typeof ref.id === 'string' && GAME.test(ref.id)
  }
}

/** The stable string form. Throws on a ref that has none, so nothing malformed is ever stored. */
export function formatRef(ref: EntityRef): string {
  if (!isValidRef(ref)) throw new TypeError(`Not a valid entity ref: ${JSON.stringify(ref)}`)
  return ref.kind === 'trainer' ? `trainer:${ref.game}/${ref.id}` : `${ref.kind}:${ref.id}`
}

/** The ref a string names, or null for anything that is not a canonical ref string. */
export function parseRef(text: string): EntityRef | null {
  if (typeof text !== 'string') return null
  const colon = text.indexOf(':')
  if (colon <= 0) return null
  const kind = text.slice(0, colon)
  const body = text.slice(colon + 1)
  if (!isKind(kind)) return null

  let ref: EntityRef
  if (NUMERIC_KINDS.has(kind)) {
    if (!NUMERIC.test(body)) return null
    ref = { kind, id: Number(body) } as EntityRef
  } else if (kind === 'trainer') {
    const slash = body.indexOf('/')
    if (slash <= 0) return null
    ref = { kind, game: body.slice(0, slash), id: body.slice(slash + 1) }
  } else {
    ref = { kind, id: body } as EntityRef
  }
  return isValidRef(ref) ? ref : null
}

/** Same thing pointed at. Structural, so two refs built separately compare equal. */
export function sameRef(a: EntityRef, b: EntityRef): boolean {
  return refKey(a) === refKey(b)
}

/** A comparison key that never throws, for refs that may not be valid. */
export function refKey(ref: EntityRef): string {
  return ref.kind === 'trainer' ? `trainer:${ref.game}/${ref.id}` : `${ref.kind}:${ref.id}`
}
