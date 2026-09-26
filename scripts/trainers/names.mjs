/**
 * Disassembly constants -> the bundle's PokeAPI ids.
 *
 * The decomps name things their own way: SPECIES_MR_MIME, DOUBLESLAP,
 * MOVE_FAINT_ATTACK, PINK_BOW, TRAINER_CLASS_... The bundle keys everything by
 * PokeAPI id and slug. Most constants match a slug once both are squashed to
 * [a-z0-9] ("DOUBLESLAP" / "double-slap" -> "doubleslap"); the rest are the
 * short alias tables below, each entry a real rename or a spelling the games
 * used, not a guess.
 *
 * NOTHING RESOLVES SILENTLY TO NOTHING. Every lookup that misses is recorded,
 * and the build throws with the whole list at the end, rather than writing a
 * party with a hole where a move was.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Constant (prefix stripped, squashed) -> bundle slug, where squashing is not enough. */
const SPECIES_ALIAS = {
  nidoranm: 'nidoran-m',
  nidoranf: 'nidoran-f',
  farfetchd: 'farfetchd',
  mrmime: 'mr-mime',
  mimejr: 'mime-jr',
  hooh: 'ho-oh',
  porygonz: 'porygon-z',
}

const MOVE_ALIAS = {
  psychicm: 'psychic',
  faintattack: 'feint-attack',
  hijumpkick: 'high-jump-kick',
  highjumpkick: 'high-jump-kick',
  vicegrip: 'vice-grip',
  thundershock: 'thunder-shock',
  selfdestruct: 'self-destruct',
  sandattack: 'sand-attack',
  smellingsalt: 'smelling-salts',
  smellingsalts: 'smelling-salts',
  conversion2: 'conversion-2',
  lockon: 'lock-on',
  doubleedge: 'double-edge',
  uturn: 'u-turn',
  xscissor: 'x-scissor',
  wakeupslap: 'wake-up-slap',
  willowisp: 'will-o-wisp',
  softboiled: 'soft-boiled',
  mudslap: 'mud-slap',
  bubblebeam: 'bubble-beam',
  solarbeam: 'solar-beam',
  sonicboom: 'sonic-boom',
  doubleslap: 'double-slap',
  dynamicpunch: 'dynamic-punch',
  thunderpunch: 'thunder-punch',
  poisonpowder: 'poison-powder',
  smokescreen: 'smokescreen',
  dragonbreath: 'dragon-breath',
  extremespeed: 'extreme-speed',
  ancientpower: 'ancient-power',
}

/**
 * Item constants the games spelled differently from PokeAPI, or items PokeAPI
 * files under their modern name. Filled from the build's miss list.
 */
const ITEM_ALIAS = {
  xspecial: 'x-sp-atk',
  xdefend: 'x-defense',
  // Gen 2's own items, which PokeAPI (and so the bundle) does not carry: each
  // resolves to the later item with the same effect, and keeps its Gen 2 name
  // through ERA_ITEM_NAMES below. The damage calculator already treats Pink Bow
  // as Silk Scarf the same way.
  pinkbow: 'silk-scarf',
  polkadotbow: 'silk-scarf',
  berry: 'oran-berry',
  goldberry: 'sitrus-berry',
  przcureberry: 'cheri-berry',
  mintberry: 'chesto-berry',
  iceberry: 'rawst-berry',
  burntberry: 'aspear-berry',
  psncureberry: 'pecha-berry',
  bitterberry: 'persim-berry',
  miracleberry: 'lum-berry',
  mysteryberry: 'leppa-berry',
}

/** The name the game itself shows, where the bundle item is a later equivalent. */
export const ERA_ITEM_NAMES = {
  pinkbow: 'Pink Bow',
  polkadotbow: 'Polkadot Bow',
  berry: 'Berry',
  goldberry: 'Gold Berry',
  przcureberry: 'PRZCureBerry',
  mintberry: 'Mint Berry',
  iceberry: 'Ice Berry',
  burntberry: 'Burnt Berry',
  psncureberry: 'PSNCureBerry',
  bitterberry: 'Bitter Berry',
  miracleberry: 'MiracleBerry',
  mysteryberry: 'MysteryBerry',
}

export function loadNames(bundleDir) {
  const read = (f) => JSON.parse(readFileSync(join(bundleDir, f), 'utf8'))
  const index = (rows) => {
    const bySlug = new Map()
    const bySquash = new Map()
    for (const r of Object.values(rows)) {
      bySlug.set(r.name, r)
      if (!bySquash.has(squash(r.name))) bySquash.set(squash(r.name), r)
    }
    return { bySlug, bySquash }
  }
  const species = index(read('species.json'))
  const moves = index(read('moves.json'))
  const items = index(read('items.json'))
  const movesById = new Map(Object.values(read('moves.json')).map((m) => [m.id, m]))
  const itemsById = new Map(Object.values(read('items.json')).map((m) => [m.id, m]))
  const misses = { species: new Map(), move: new Map(), item: new Map() }
  const lookup = (table, alias, raw) => {
    const sq = squash(String(raw ?? ''))
    return (alias[sq] && table.bySlug.get(alias[sq])) || table.bySquash.get(sq) || null
  }

  const make =
    (kind, table, alias, prefixes) =>
    (raw, context = '') => {
      if (raw == null) return null
      let key = String(raw).trim()
      for (const p of prefixes) if (key.startsWith(p)) key = key.slice(p.length)
      const sq = squash(key)
      const aliased = alias[sq]
      const hit = (aliased && table.bySlug.get(aliased)) || table.bySquash.get(sq)
      if (hit) return hit
      const where = misses[kind].get(raw) ?? new Set()
      if (context) where.add(context)
      misses[kind].set(raw, where)
      return null
    }

  return {
    species: make('species', species, SPECIES_ALIAS, ['SPECIES_']),
    move: make('move', moves, MOVE_ALIAS, ['MOVE_']),
    item: make('item', items, ITEM_ALIAS, ['ITEM_']),
    /** The game's own name for an item constant, when it is not the bundle item's. */
    itemEraName: (raw) => ERA_ITEM_NAMES[squash(String(raw ?? '').replace(/^ITEM_/, ''))] ?? null,
    speciesBySlug: (slug) => species.bySlug.get(slug),
    moveBySlug: (slug) => moves.bySlug.get(slug),
    /** Lookups that do not record a miss: for comparing against the wiki's spelling. */
    moveQuiet: (raw) => lookup(moves, MOVE_ALIAS, raw),
    itemQuiet: (raw) => lookup(items, ITEM_ALIAS, raw),
    itemById: (id) => itemsById.get(id),
    /** Gen 4 learnset archives store move indices, which are the national move ids. */
    moveById: (id) => movesById.get(id),
    itemBySlug: (slug) => items.bySlug.get(slug),
    misses,
    /** Throws with every miss, grouped, when any lookup failed. */
    assertClean() {
      const lines = []
      for (const [kind, m] of Object.entries(misses)) {
        for (const [raw, where] of m) {
          lines.push(`  ${kind} ${raw}  (${[...where].slice(0, 4).join(', ')})`)
        }
      }
      if (lines.length) throw new Error(`unresolved names:\n${lines.join('\n')}`)
    },
  }
}

export { squash }
