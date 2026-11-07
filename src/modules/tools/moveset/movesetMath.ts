/**
 * #10 Moveset searcher: which Pokemon can know ALL of the given moves in one
 * game, by the learn methods allowed.
 *
 * PURE, AND UI-FREE. It reads one game's learnset partition (the same rows the
 * species page's Learnset tab shows) and nothing else. A Pokemon counts when
 * each move is learnable by at least one allowed method -- "together" means
 * "each, somehow", not "in one breeding" (that is #16's question).
 *
 * PER FORM: Deoxys' and Rotom's forms learn different moves, so a row is a
 * pokemon_id (a variety), labelled with its form.
 */

import type { LearnRow } from '../../../data'

export type MethodGroup = 'level-up' | 'machine' | 'tutor' | 'egg' | 'special'

/** Which group a bundle method belongs to: Volt Tackle's Light Ball egg is an egg move. */
export function groupOf(method: string): MethodGroup {
  if (method === 'level-up' || method === 'machine' || method === 'tutor' || method === 'egg')
    return method
  if (method === 'light-ball-egg') return 'egg'
  return 'special'
}

export const METHOD_LABEL: Record<MethodGroup, string> = {
  'level-up': 'Level-up',
  machine: 'TM/HM',
  tutor: 'Tutor',
  egg: 'Egg',
  special: 'Special (event, form)',
}

export interface MoveHow {
  moveId: number
  /** "L32", "TM", "Tutor", "Egg"... ascending level first. */
  ways: string[]
}

export interface MovesetHit {
  pokemonId: number
  speciesId: number
  how: MoveHow[]
}

export type MovesetOutcome = { ok: true; hits: MovesetHit[] } | { ok: false; reason: string }

export function searchMovesets(
  rows: readonly LearnRow[],
  moveIds: readonly number[],
  methods: ReadonlySet<MethodGroup>,
  /** Species that exist in the game's generation. */
  inScope: (speciesId: number) => boolean,
): MovesetOutcome {
  const wanted = [...new Set(moveIds)]
  if (wanted.length === 0) return { ok: false, reason: 'Pick at least one move.' }
  if (methods.size === 0) return { ok: false, reason: 'Allow at least one way to learn a move.' }
  const byMon = new Map<number, { speciesId: number; ways: Map<number, Set<string>> }>()
  for (const r of rows) {
    if (!wanted.includes(r.move_id) || !inScope(r.species_id)) continue
    const group = groupOf(r.method)
    if (!methods.has(group)) continue
    const mon = byMon.get(r.pokemon_id) ?? { speciesId: r.species_id, ways: new Map() }
    const way =
      group === 'level-up' ? `L${r.level}` : group === 'machine' ? 'TM/HM' : METHOD_LABEL[group]
    const set = mon.ways.get(r.move_id) ?? new Set<string>()
    set.add(way)
    mon.ways.set(r.move_id, set)
    byMon.set(r.pokemon_id, mon)
  }
  const hits: MovesetHit[] = []
  for (const [pokemonId, mon] of byMon) {
    if (!wanted.every((m) => mon.ways.has(m))) continue
    hits.push({
      pokemonId,
      speciesId: mon.speciesId,
      how: wanted.map((moveId) => ({
        moveId,
        ways: [...mon.ways.get(moveId)!].sort((a, b) => wayOrder(a) - wayOrder(b)),
      })),
    })
  }
  hits.sort((a, b) => a.speciesId - b.speciesId || a.pokemonId - b.pokemonId)
  return { ok: true, hits }
}

const wayOrder = (w: string) => (w.startsWith('L') ? Number(w.slice(1)) : 1000 + w.length)
