/**
 * Every tool, as data: the Tools index renders this list and nothing else.
 *
 * `n` is the tool's number in the owner's brief (docs/tools/PLAN.md), kept so a
 * report like "#7 is done" maps to one line here. Tools that predate the brief
 * (Experience, Type Coverage, Team Matchup) have no number and sit in their own
 * group: the index lists all tools, not only the brief's.
 *
 * A TOOL ENTRY POINTS SOMEWHERE; it does not have to be a page of its own. Tools
 * that already existed stay where they are (the brief: "not moving existing
 * calculators") -- a tab of the Calculators screen, the Damage Calculator page --
 * and their index entries open that place. New tools are pages registered in
 * ./pages.ts.
 *
 * ADDED AS BUILT. A tool joins this list on the branch that builds it, so the
 * index never offers something that does not answer yet.
 */

import type { CalculatorTab } from '../calculators/Calculators'
import type { PageId } from '../nav/navConfig'
import type { ToolGate } from './gates'

export type ToolGroupId = 'core' | 'reference' | 'planners' | 'frontier' | 'fun' | 'more'

export const TOOL_GROUPS: readonly { id: ToolGroupId; label: string }[] = [
  { id: 'core', label: 'Core mechanics' },
  { id: 'reference', label: 'Search and reference' },
  { id: 'planners', label: 'Planners and simulators' },
  { id: 'frontier', label: 'Battle Frontier' },
  { id: 'fun', label: 'Fun' },
  { id: 'more', label: 'More tools' },
]

export type ToolTarget =
  /** A tab of the Calculators screen, opened on that tab. */
  | { kind: 'calculator'; tab: CalculatorTab }
  /** Any other page: the Damage Calculator, Type Coverage, a tool page. */
  | { kind: 'page'; id: PageId }

export interface ToolEntry {
  /** Stable key: the brief's number, or a slug for the tools that predate it. */
  key: string
  /** The brief's number, if the tool is one of its 23. */
  n?: number
  label: string
  group: ToolGroupId
  /** One line for the index: what question the tool answers. */
  blurb: string
  /**
   * Where it can answer. Absent for a tool that owns its scope (the Damage
   * Calculator, Type Coverage and Team Matchup carry their own selectors) or has
   * no era-specific mechanic (Experience).
   */
  gate?: ToolGate
  target: ToolTarget
}

const GEN_1_4 = { gens: [1, 2, 3, 4] } as const

export const TOOLS: readonly ToolEntry[] = [
  {
    key: '1',
    n: 1,
    label: 'Stat calculator',
    group: 'core',
    blurb: 'A Pokémon’s stats from base stats, level, nature and EVs/IVs — DVs and Stat Exp in Gen 1–2.',
    gate: GEN_1_4,
    target: { kind: 'calculator', tab: 'Stat' },
  },
  {
    key: '2',
    n: 2,
    label: 'Hidden Power',
    group: 'core',
    blurb: 'Hidden Power’s type and power from a spread — four DVs in Gen 2, six IVs from Gen 3.',
    gate: { gens: [2, 3, 4] },
    target: { kind: 'page', id: 'tool-hidden-power' },
  },
  {
    key: '3',
    n: 3,
    label: 'Damage calculator',
    group: 'core',
    blurb: 'Every damage roll of one move against one target, with the KO chance, per generation.',
    target: { kind: 'page', id: 'damage-calculator' },
  },
  {
    key: '4',
    n: 4,
    label: 'Multi-move comparison',
    group: 'core',
    blurb: 'All four moves of each Pokémon against the other: the Damage Calculator’s top row.',
    target: { kind: 'page', id: 'damage-calculator' },
  },
  {
    key: '5',
    n: 5,
    label: 'Speed tiers',
    group: 'core',
    blurb: 'Any set of Pokémon — typed in or loaded from a team — in the order they move, ties and priority marked.',
    gate: GEN_1_4,
    target: { kind: 'page', id: 'tool-speed-tiers' },
  },
  {
    key: '8',
    n: 8,
    label: 'Catch rate',
    group: 'core',
    blurb: 'The chance one ball catches, from species, HP, status and ball.',
    gate: GEN_1_4,
    target: { kind: 'calculator', tab: 'Catch Rate' },
  },
  {
    key: 'experience',
    label: 'Experience',
    group: 'more',
    blurb: 'Experience to the next level, by growth rate.',
    target: { kind: 'calculator', tab: 'Experience' },
  },
  {
    key: 'type-coverage',
    label: 'Type coverage',
    group: 'more',
    blurb: 'Which type chart applies, and which type combinations really exist.',
    target: { kind: 'page', id: 'type-coverage' },
  },
  {
    key: 'team-matchup',
    label: 'Team matchup',
    group: 'more',
    blurb: 'Your team against a trainer’s, with that game’s own AI.',
    target: { kind: 'page', id: 'team-matchup' },
  },
]

/** The entry with this key, or undefined. */
export function findTool(key: string): ToolEntry | undefined {
  return TOOLS.find((t) => t.key === key)
}
