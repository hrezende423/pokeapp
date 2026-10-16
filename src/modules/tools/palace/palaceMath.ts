/**
 * #20 Battle Palace odds (Emerald): which kind of move a Pokémon picks on its own.
 *
 * PURE, AND UI-FREE. From pokeemerald:
 *   - battle_script_commands.c gBattlePalaceNatureToMoveGroupLikelihood: per
 *     nature, the chance of the Attack and Defense groups (Support is the rest),
 *     one pair above half HP and one at or below it (and awake -- the flag is set
 *     where `maxHP / 2 >= hp && hp != 0 && !asleep`);
 *   - battle_gfx_sfx_util.c GetBattlePalaceMoveGroup: a move's group from its
 *     target and power;
 *   - ChooseMoveAndTargetInBattlePalace: roll the group; if the Pokémon has moves
 *     in it, the Frontier AI picks among THOSE; if it has none, a random move from
 *     the rest -- and then a 50% chance it does nothing ("unable to use the move").
 *     That fallback carries a bug the tool keeps: the check for "two or more
 *     Support moves" tests the Defense count, so it is never true.
 */

/** [attack, defense] above half HP, then [attack, defense] at or below it; Support is the rest. */
const STYLE: Record<string, readonly [number, number, number, number]> = {
  hardy: [61, 7, 61, 7],
  lonely: [20, 25, 84, 8],
  brave: [70, 15, 32, 60],
  adamant: [38, 31, 70, 15],
  naughty: [20, 70, 70, 22],
  bold: [30, 20, 32, 58],
  docile: [56, 22, 56, 22],
  relaxed: [25, 15, 75, 15],
  impish: [69, 6, 28, 55],
  lax: [35, 10, 29, 6],
  timid: [62, 10, 30, 20],
  hasty: [58, 37, 88, 6],
  serious: [34, 11, 29, 11],
  jolly: [35, 5, 35, 60],
  naive: [56, 22, 56, 22],
  modest: [35, 45, 34, 60],
  mild: [44, 50, 34, 6],
  quiet: [56, 22, 56, 22],
  bashful: [30, 58, 30, 58],
  rash: [30, 13, 27, 6],
  calm: [40, 50, 25, 62],
  gentle: [18, 70, 90, 5],
  sassy: [88, 6, 22, 20],
  careful: [42, 50, 42, 5],
  quirky: [56, 22, 56, 22],
}

export type Group = 'attack' | 'defense' | 'support'
export const GROUPS: readonly Group[] = ['attack', 'defense', 'support']

/** The group chances for a nature, as percentages: [attack, defense, support]. */
export function styleOf(nature: string, low: boolean): [number, number, number] | null {
  const s = STYLE[nature]
  if (!s) return null
  const [a, d] = low ? [s[2], s[3]] : [s[0], s[1]]
  return [a, d, 100 - a - d]
}

/** GetBattlePalaceMoveGroup, from Emerald's own target constant and power. */
export function palaceGroup(target: string, power: number): Group {
  switch (target) {
    case 'MOVE_TARGET_SELECTED':
    case 'MOVE_TARGET_USER_OR_SELECTED':
    case 'MOVE_TARGET_RANDOM':
    case 'MOVE_TARGET_BOTH':
    case 'MOVE_TARGET_FOES_AND_ALLY':
      return power === 0 ? 'support' : 'attack'
    case 'MOVE_TARGET_DEPENDS':
    case 'MOVE_TARGET_OPPONENTS_FIELD':
      return 'support'
    case 'MOVE_TARGET_USER':
      return 'defense'
    default:
      return 'attack'
  }
}

export interface PalaceMove {
  id: number
  group: Group
}

export interface GroupOdds {
  group: Group
  /** 0-1: the chance the nature picks this group. */
  chance: number
  /** The Pokémon's moves in it; the AI chooses among them. Empty = the fallback. */
  moves: number[]
}

export interface PalaceOdds {
  groups: GroupOdds[]
  /** Exact chance of each move being used THROUGH the fallback (an empty group rolled). */
  fallback: Map<number, number>
  /** Chance it does nothing this turn ("unable to use the move"). */
  idle: number
}

export function palaceOdds(nature: string, moves: PalaceMove[], low: boolean): PalaceOdds | null {
  const style = styleOf(nature, low)
  if (!style || moves.length === 0) return null
  const groups: GroupOdds[] = GROUPS.map((g, i) => ({
    group: g,
    chance: style[i] / 100,
    moves: moves.filter((m) => m.group === g).map((m) => m.id),
  }))

  // The fallback's pool, exactly as the game builds it -- bug included.
  const count = (g: Group) => moves.filter((m) => m.group === g).length
  const multiple = (count('attack') >= 2 ? 1 : 0) + (count('defense') >= 2 ? 1 : 0) // Support never counts
  let pool: number[]
  if (multiple !== 1) pool = moves.map((m) => m.id)
  else {
    const g: Group = count('defense') >= 2 ? 'defense' : 'attack'
    pool = moves.filter((m) => m.group === g).map((m) => m.id)
  }

  const fallback = new Map<number, number>()
  let idle = 0
  for (const g of groups) {
    if (g.moves.length > 0 || g.chance === 0) continue
    for (const id of pool)
      fallback.set(id, (fallback.get(id) ?? 0) + (g.chance * 0.5) / pool.length)
    idle += g.chance * 0.5
  }
  return { groups, fallback, idle }
}
