/**
 * Breeding chain planner: which fathers carry an egg move to a target species.
 *
 * Gen 2-4 rules only, and that is the whole reason the scope stops there. In
 * those games an egg move passes from the FATHER alone, so a plan is a path of
 * evolution lines: a line whose males learn the move by level-up, TM or tutor
 * (the source), then lines that receive it as an egg move and pass it on, ending
 * at the target. Gen 6 let the mother pass egg moves too and Gen 8 added
 * same-species transfer, so the same graph would answer the wrong question there.
 *
 * Nodes are evolution LINES, not species: the egg hatches as the line's root and
 * evolves into whichever member is breedable (Pichu is Undiscovered; the Pikachu
 * it becomes is not). Moves are kept on evolution, so a line "knows" a move when
 * any member learns it.
 */

import {
  chainForGeneration,
  getEvolutionChain,
  getItem,
  getMove,
  learnsetRowsForVersionGroup,
  listVersionGroups,
} from '../data'
import type { EvolutionNode, LearnRow, Species, VersionGroup } from '../data'
import { BREEDING_INTRODUCED_IN_GENERATION, speciesEntries } from '../modules/dex/entrySources'

export const LAST_PLANNED_GENERATION = 4
const NO_DAYCARE = new Set(['colosseum', 'xd'])

export const UNDISCOVERED_GROUP = 15
const DITTO_GROUP = 13
const SMEARGLE = 235
/** Struggle and Chatter cannot be Sketched. */
const UNSKETCHABLE = new Set([165, 448])

/**
 * Male-only lines whose eggs come from a separate female-only species: a female
 * Nidoran♀ lays Nidoran♂ eggs, an Illumise lays Volbeat eggs. Without this both
 * would read as "cannot breed", which is wrong.
 */
const MOTHER_LINE_OF = new Map<number, number>([
  [32, 29],
  [313, 314],
])

export type How =
  | { kind: 'level'; level: number }
  | { kind: 'machine'; label: string }
  | { kind: 'tutor' }
  | { kind: 'sketch' }

export interface Knower {
  species: Species
  how: How
}

export interface Line {
  key: string
  members: Species[]
  root: Species
  fathers: Species[]
  mothers: Species[]
  fatherGroups: number[]
  motherGroups: number[]
  /** Set when the root only hatches with an incense held (Azurill, Wynaut, the Gen 4 babies). */
  incense: { item: string; otherwise: Species | null } | null
}

export interface Game {
  vg: VersionGroup
  generation: number
  species: Species[]
  lines: Line[]
  lineOf: Map<number, Line>
  learns: Map<number, Map<number, LearnRow[]>>
}

export interface EggMove {
  moveId: number
  holders: Species[]
  lightBall: boolean
}

export interface Chain {
  /** lines[0] is the source, the last entry is the target. */
  lines: Line[]
  source: Knower
  /** groups[i] is the egg group shared by lines[i] (father) and lines[i + 1] (mother). */
  groups: number[]
}

export interface Plan {
  breedings: number | null
  chains: Chain[]
  chainCount: number
  /** The target line learns the move itself, so breeding is optional. */
  selfLearn: Knower | null
}

/** The Gen 2-4 games with a daycare, in release order. */
export function breedingGames(): VersionGroup[] {
  return listVersionGroups()
    .filter((vg) => {
      const gen = vg.generation_id ?? 0
      return (
        gen >= BREEDING_INTRODUCED_IN_GENERATION &&
        gen <= LAST_PLANNED_GENERATION &&
        !NO_DAYCARE.has(vg.name)
      )
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

const canFather = (s: Species): boolean =>
  s.gender_rate != null &&
  s.gender_rate >= 0 &&
  s.gender_rate < 8 &&
  !s.egg_group_ids.includes(UNDISCOVERED_GROUP) &&
  !s.egg_group_ids.includes(DITTO_GROUP)

const canMother = (s: Species): boolean =>
  s.gender_rate != null &&
  s.gender_rate > 0 &&
  !s.egg_group_ids.includes(UNDISCOVERED_GROUP) &&
  !s.egg_group_ids.includes(DITTO_GROUP)

const groupsOf = (list: Species[]): number[] => [...new Set(list.flatMap((s) => s.egg_group_ids))]

function walk(node: EvolutionNode, out: number[] = []): number[] {
  out.push(node.species_id)
  node.evolves_to.forEach((child) => walk(child, out))
  return out
}

export async function loadGame(vg: VersionGroup): Promise<Game> {
  const generation = vg.generation_id ?? LAST_PLANNED_GENERATION
  const rows = await learnsetRowsForVersionGroup(vg.name)

  const learns = new Map<number, Map<number, LearnRow[]>>()
  for (const row of rows) {
    // Alternate forms share their species' breeding; the default form speaks for it.
    if (row.pokemon_id !== row.species_id) continue
    let byMove = learns.get(row.species_id)
    if (!byMove) learns.set(row.species_id, (byMove = new Map()))
    const list = byMove.get(row.move_id)
    if (list) list.push(row)
    else byMove.set(row.move_id, [row])
  }

  const species = speciesEntries({ generation, isAll: false }).filter((s) => learns.has(s.id))
  const inGame = new Map(species.map((s) => [s.id, s]))

  const lineByKey = new Map<string, Line>()
  const lineOf = new Map<number, Line>()
  for (const s of species) {
    const chain = s.evolution_chain_id != null ? getEvolutionChain(s.evolution_chain_id) : undefined
    const scoped = chain ? chainForGeneration(chain, generation, s.id) : undefined
    const order = scoped ? walk(scoped.chain) : [s.id]
    const key = `${s.evolution_chain_id}:${order[0]}`
    let line = lineByKey.get(key)
    if (!line) {
      const members = order.map((id) => inGame.get(id)).filter((m): m is Species => !!m)
      const root = members[0] ?? s
      const fathers = members.filter(canFather)
      const mothers = members.filter(canMother)
      const incenseId = scoped?.baby_trigger_item_id ?? null
      line = {
        key,
        members: members.length ? members : [s],
        root,
        fathers,
        mothers,
        fatherGroups: groupsOf(fathers),
        motherGroups: groupsOf(mothers),
        incense:
          incenseId != null && generation >= 3
            ? {
                item: getItem(incenseId)?.display_name ?? 'incense',
                otherwise: scoped?.chain.evolves_to[0]
                  ? (inGame.get(scoped.chain.evolves_to[0].species_id) ?? null)
                  : null,
              }
            : null,
      }
      lineByKey.set(key, line)
    }
    lineOf.set(s.id, line)
  }

  for (const [maleOnlyId, motherId] of MOTHER_LINE_OF) {
    const line = lineOf.get(maleOnlyId)
    const from = lineOf.get(motherId)
    if (!line || !from) continue
    line.mothers = [...line.mothers, ...from.mothers]
    line.motherGroups = groupsOf(line.mothers)
  }

  return { vg, generation, species, lines: [...lineByKey.values()], lineOf, learns }
}

/** Every egg move a line can hatch with in this game, by move id. */
export function eggMovesOf(game: Game, line: Line): EggMove[] {
  const byMove = new Map<number, EggMove>()
  for (const member of line.members) {
    for (const [moveId, rows] of game.learns.get(member.id) ?? []) {
      for (const row of rows) {
        if (row.method !== 'egg' && row.method !== 'light-ball-egg') continue
        let entry = byMove.get(moveId)
        if (!entry) byMove.set(moveId, (entry = { moveId, holders: [], lightBall: false }))
        if (row.method === 'light-ball-egg') entry.lightBall = true
        else if (!entry.holders.includes(member)) entry.holders.push(member)
      }
    }
  }
  return [...byMove.values()]
}

function hatchesWith(game: Game, line: Line, moveId: number): boolean {
  return line.members.some((m) =>
    (game.learns.get(m.id)?.get(moveId) ?? []).some((r) => r.method === 'egg'),
  )
}

/**
 * The member that hatches knowing the move. Usually the root; for an incense line
 * it can be the form that hatches WITHOUT the incense (Emerald's Marill, not Azurill).
 */
export function hatchlingFor(game: Game, line: Line, moveId: number): Species {
  const holders = line.members.filter((m) =>
    (game.learns.get(m.id)?.get(moveId) ?? []).some((r) => r.method === 'egg'),
  )
  return holders.includes(line.root) ? line.root : (holders[0] ?? line.root)
}

/** The member that actually stands in the daycare: Pikachu, never the Undiscovered Pichu. */
export const fatherOf = (line: Line): Species => line.fathers[0] ?? line.root

/**
 * The source's father: the learner itself when it can breed, otherwise the first
 * breedable member it evolves into (Pichu learns it, the Pikachu it becomes breeds).
 */
export function sourceFather(k: Knower, line: Line): Species {
  if (line.fathers.includes(k.species)) return k.species
  const from = line.members.indexOf(k.species)
  return line.fathers.find((f) => line.members.indexOf(f) > from) ?? fatherOf(line)
}

const HOW_RANK = { level: 0, machine: 1, tutor: 2, sketch: 3 } as const

export function howRank(how: How): number {
  return HOW_RANK[how.kind] + (how.kind === 'level' ? how.level / 1000 : 0)
}

function machineLabel(game: Game, moveId: number): string {
  const machine = getMove(moveId)?.machines.find((m) => m.version_group === game.vg.name)
  return (machine?.item_id != null && getItem(machine.item_id)?.display_name) || 'TM'
}

/** How a line's males can come to know the move without breeding, best option first. */
export function knows(game: Game, line: Line, moveId: number, allowSketch: boolean): Knower | null {
  let best: Knower | null = null
  const offer = (k: Knower) => {
    if (!best || howRank(k.how) < howRank(best.how)) best = k
  }
  for (const member of line.members) {
    for (const row of game.learns.get(member.id)?.get(moveId) ?? []) {
      if (row.method === 'level-up') offer({ species: member, how: { kind: 'level', level: row.level } })
      else if (row.method === 'machine')
        offer({ species: member, how: { kind: 'machine', label: machineLabel(game, moveId) } })
      else if (row.method === 'tutor') offer({ species: member, how: { kind: 'tutor' } })
    }
  }
  if (
    allowSketch &&
    !UNSKETCHABLE.has(moveId) &&
    (getMove(moveId)?.generation_id ?? 99) <= game.generation
  ) {
    const smeargle = line.members.find((m) => m.id === SMEARGLE)
    if (smeargle) offer({ species: smeargle, how: { kind: 'sketch' } })
  }
  return best
}

const shareGroup = (a: number[], b: number[]): number | undefined => a.find((g) => b.includes(g))

interface Search {
  dist: Map<Line, number>
  prev: Map<Line, Line[]>
  sources: Map<Line, Knower>
}

/** Breadth-first from every source line; the target is never a source of itself. */
function search(game: Game, target: Line, moveId: number, allowSketch: boolean): Search {
  const dist = new Map<Line, number>()
  const prev = new Map<Line, Line[]>()
  const sources = new Map<Line, Knower>()
  const queue: Line[] = []
  for (const line of game.lines) {
    if (line === target || line.fathers.length === 0) continue
    const k = knows(game, line, moveId, allowSketch)
    if (!k) continue
    sources.set(line, k)
    dist.set(line, 0)
    queue.push(line)
  }
  const receivers = game.lines.filter(
    (l) => l.mothers.length > 0 && hatchesWith(game, l, moveId),
  )
  for (let i = 0; i < queue.length; i++) {
    const father = queue[i]
    if (father === target || father.fathers.length === 0) continue
    const d = (dist.get(father) ?? 0) + 1
    for (const child of receivers) {
      if (child === father || sources.has(child)) continue
      if (shareGroup(father.fatherGroups, child.motherGroups) === undefined) continue
      const known = dist.get(child)
      if (known === undefined) {
        dist.set(child, d)
        prev.set(child, [father])
        queue.push(child)
      } else if (known === d) {
        prev.get(child)?.push(father)
      }
    }
  }
  return { dist, prev, sources }
}

/** Fewest breedings only, for the egg-move list. */
export function breedingsFor(game: Game, target: Line, moveId: number, allowSketch: boolean): number | null {
  if (!hatchesWith(game, target, moveId) || target.mothers.length === 0) return null
  return search(game, target, moveId, allowSketch).dist.get(target) ?? null
}

const CHAIN_CAP = 200

export function planMove(game: Game, target: Line, moveId: number, allowSketch: boolean): Plan {
  const selfLearn = knows(game, target, moveId, false)
  if (!hatchesWith(game, target, moveId) || target.mothers.length === 0) {
    return { breedings: null, chains: [], chainCount: 0, selfLearn }
  }
  const { dist, prev, sources } = search(game, target, moveId, allowSketch)
  const breedings = dist.get(target) ?? null
  if (breedings === null) return { breedings, chains: [], chainCount: 0, selfLearn }

  const paths: Line[][] = []
  let count = 0
  const back = (line: Line, tail: Line[]) => {
    const path = [line, ...tail]
    if (sources.has(line)) {
      count++
      if (paths.length < CHAIN_CAP) paths.push(path)
      return
    }
    for (const p of prev.get(line) ?? []) back(p, path)
  }
  back(target, [])

  const chains = paths.map((lines): Chain => {
    const groups = lines
      .slice(0, -1)
      .map((l, i) => shareGroup(l.fatherGroups, lines[i + 1].motherGroups) ?? 0)
    return { lines, source: sources.get(lines[0]) as Knower, groups }
  })
  chains.sort(
    (a, b) =>
      howRank(a.source.how) - howRank(b.source.how) ||
      a.source.species.display_name.localeCompare(b.source.species.display_name),
  )
  return { breedings, chains, chainCount: count, selfLearn }
}
