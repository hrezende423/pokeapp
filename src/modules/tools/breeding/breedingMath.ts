/**
 * #16 Breeding chain: how to get an egg move onto a Pokemon, in one game.
 *
 * PURE, AND UI-FREE. The Gen 2-4 rules, as the games have them:
 *   - the egg is the MOTHER's species (or the non-Ditto parent's), so the target
 *     line needs females -- a male-only or genderless line breeds only with
 *     Ditto, and Ditto passes no moves;
 *   - only the FATHER passes an egg move, and only one he knows; he must share an
 *     egg group with the mother (Ditto and Undiscovered never count);
 *   - he may know it any way: level-up, TM/HM, tutor -- or as an egg move of his
 *     own, which is a chain: his line needs a father of its own.
 *
 * The search is breadth-first over evolution lines, so the chains returned are
 * the SHORTEST (fewest breedings), up to MAX_STEPS. Egg moves live on a line's
 * hatchling in the learnset bundle, so a line's egg list is its hatchling's.
 * Obtainability is not checked: a father may need to be traded in.
 */

import type { LearnRow, Species } from '../../../data'

export const MAX_STEPS = 4
const NO_EGGS = 15
const DITTO = 13
const MALE_ONLY = 0
const FEMALE_ONLY = 8
const GENDERLESS = -1

export interface Source {
  speciesId: number
  /** How this father learns the move himself: 'level-up 41', 'machine', 'tutor'. */
  how: string[]
}

export interface Chain {
  /** Lines bred in between, nearest the target first: a male of each must hatch knowing it. */
  via: number[]
  /** Fathers at the far end, who learn the move themselves. */
  sources: Source[]
}

export type BreedingResult =
  { ok: true; steps: number; chains: Chain[]; lightBall: boolean } | { ok: false; reason: string }

const canBeFather = (s: Species) =>
  s.gender_rate !== FEMALE_ONLY &&
  s.gender_rate !== GENDERLESS &&
  s.egg_group_ids.every((g) => g !== NO_EGGS)
const hasFemales = (s: Species) => s.gender_rate !== MALE_ONLY && s.gender_rate !== GENDERLESS

/** The game's egg moves for a hatchling (Volt Tackle's Light Ball egg included). */
export function eggMovesOf(rows: LearnRow[], speciesId: number): Set<number> {
  return new Set(
    rows
      .filter(
        (r) => r.species_id === speciesId && (r.method === 'egg' || r.method === 'light-ball-egg'),
      )
      .map((r) => r.move_id),
  )
}

/** Species the game hatches with egg moves: the targets this tool can answer for. */
export function hatchlings(rows: LearnRow[], pool: Species[]): Species[] {
  const ids = new Set(rows.filter((r) => r.method === 'egg').map((r) => r.species_id))
  return pool.filter((s) => ids.has(s.id))
}

export function breedingChain(
  rows: LearnRow[],
  pool: Species[],
  targetId: number,
  moveId: number,
): BreedingResult {
  const target = pool.find((s) => s.id === targetId)
  if (!target) return { ok: false, reason: 'Pick a Pokémon that hatches in this game.' }
  if (!eggMovesOf(rows, targetId).has(moveId))
    return {
      ok: false,
      reason: `That is not one of ${target.display_name}’s egg moves in this game.`,
    }

  // How every species knows the move, from this game's rows.
  const learns = new Map<number, Map<string, number[]>>()
  for (const r of rows) {
    if (r.move_id !== moveId) continue
    const m = learns.get(r.species_id) ?? new Map<string, number[]>()
    m.set(r.method, [...(m.get(r.method) ?? []), r.level])
    learns.set(r.species_id, m)
  }
  const lightBall = learns.get(targetId)?.has('light-ball-egg') ?? false

  const line = new Map<number, Species[]>()
  for (const s of pool)
    if (s.evolution_chain_id != null)
      line.set(s.evolution_chain_id, [...(line.get(s.evolution_chain_id) ?? []), s])
  const lineOf = (s: Species) =>
    s.evolution_chain_id != null ? (line.get(s.evolution_chain_id) ?? [s]) : [s]
  /** A line breeds in the groups of its adults (a baby is Undiscovered, its parents are not). */
  const groupsOf = (s: Species) =>
    new Set(
      lineOf(s)
        .flatMap((x) => x.egg_group_ids)
        .filter((g) => g !== NO_EGGS && g !== DITTO),
    )

  // The mother: the target line must have females that can breed.
  const mothers = lineOf(target).filter(hasFemales)
  if (mothers.length === 0 || groupsOf(target).size === 0)
    return {
      ok: false,
      reason: `${target.display_name}’s line has no females that can breed, so its eggs come only from Ditto — and Ditto passes no moves.`,
    }

  const direct = (s: Species): string[] => {
    const m = learns.get(s.id)
    if (!m) return []
    const how: string[] = []
    for (const [method, levels] of m) {
      if (method === 'egg' || method === 'light-ball-egg') continue
      how.push(
        method === 'level-up'
          ? `level ${Math.min(...levels)}`
          : method === 'machine'
            ? 'TM/HM'
            : method,
      )
    }
    return how
  }

  const seen = new Set<number>([target.id])
  let frontier: { hatchling: Species; via: number[] }[] = [{ hatchling: target, via: [] }]
  for (let step = 1; step <= MAX_STEPS && frontier.length; step++) {
    const chains: Chain[] = []
    const next: typeof frontier = []
    for (const { hatchling, via } of frontier) {
      const groups = groupsOf(hatchling)
      const sources: Source[] = []
      for (const f of pool) {
        if (!canBeFather(f) || !f.egg_group_ids.some((g) => groups.has(g))) continue
        const how = direct(f)
        if (how.length) sources.push({ speciesId: f.id, how })
      }
      if (sources.length) chains.push({ via, sources })
      // Lines that could carry it one breeding further: a hatchling with the
      // move as an egg move, whose males can father the current hatchling.
      for (const h of pool) {
        if (seen.has(h.id) || !learns.get(h.id)?.has('egg')) continue
        if (!lineOf(h).some(hasFemales)) continue
        const males = lineOf(h).filter(
          (x) => canBeFather(x) && x.egg_group_ids.some((g) => groups.has(g)),
        )
        if (males.length === 0) continue
        seen.add(h.id)
        next.push({ hatchling: h, via: [...via, h.id] })
      }
    }
    if (chains.length) return { ok: true, steps: step, chains, lightBall }
    frontier = next
  }
  return lightBall
    ? { ok: true, steps: 0, chains: [], lightBall }
    : {
        ok: false,
        reason: `No chain of up to ${MAX_STEPS} breedings passes it on in this game.`,
      }
}
