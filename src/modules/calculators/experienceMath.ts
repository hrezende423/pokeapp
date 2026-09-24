/**
 * Experience: the level curves, and EXP gained from a defeat.
 *
 * PURE, AND UI-FREE, same discipline as the other calculator math modules.
 *
 * THE SIX CURVES ARE ONE FORMULA EACH, UNCHANGED SINCE GENERATION I. PokeAPI's
 * `growth_rate` slugs are the awkward part: `slow-then-very-fast` is Erratic and
 * `fast-then-very-slow` is Fluctuating, named for the SHAPE of the curve rather
 * than by the name every player-facing source uses. Both names are kept in the
 * type so a caller reading `species.growth_rate` needs no translation table.
 *
 * Every level-100 total below is a well-known published constant (Medium Slow's
 * 1,059,860 in particular has no simpler form) — cross-checked against those
 * rather than trusted on the algebra alone.
 */

export type GrowthRate =
  | 'fast'
  | 'medium'
  | 'medium-slow'
  | 'slow'
  /** Erratic. */
  | 'slow-then-very-fast'
  /** Fluctuating. */
  | 'fast-then-very-slow'

export const GROWTH_RATE_LABELS: Record<GrowthRate, string> = {
  fast: 'Fast',
  medium: 'Medium Fast',
  'medium-slow': 'Medium Slow',
  slow: 'Slow',
  'slow-then-very-fast': 'Erratic',
  'fast-then-very-slow': 'Fluctuating',
}

export const MAX_LEVEL = 100

/** Total EXP required to reach level `n` (1-100), for one growth rate. */
export function expForLevel(rate: GrowthRate, n: number): number {
  const level = Math.min(MAX_LEVEL, Math.max(1, n))
  const cubed = level ** 3

  const raw = (() => {
    switch (rate) {
      case 'fast':
        return (4 * cubed) / 5
      case 'medium':
        return cubed
      case 'medium-slow':
        return 1.2 * cubed - 15 * level ** 2 + 100 * level - 140
      case 'slow':
        return (5 * cubed) / 4
      case 'slow-then-very-fast':
        if (level < 50) return (cubed * (100 - level)) / 50
        if (level < 68) return (cubed * (150 - level)) / 100
        if (level < 98) return (cubed * Math.floor((1911 - 10 * level) / 3)) / 500
        return (cubed * (160 - level)) / 100
      case 'fast-then-very-slow':
        if (level < 15) return (cubed * (Math.floor((level + 1) / 3) + 24)) / 50
        if (level < 36) return (cubed * (level + 14)) / 50
        return (cubed * (Math.floor(level / 2) + 32)) / 50
    }
  })()

  return Math.max(0, Math.floor(raw))
}

/** EXP needed from level `n` to reach `n + 1`. */
export function expToNextLevel(rate: GrowthRate, n: number): number | null {
  if (n >= MAX_LEVEL) return null
  return expForLevel(rate, n + 1) - expForLevel(rate, n)
}

/** The level a total EXP amount corresponds to — the highest level it clears. */
export function levelForExp(rate: GrowthRate, totalExp: number): number {
  let level = 1
  while (level < MAX_LEVEL && expForLevel(rate, level + 1) <= totalExp) level++
  return level
}

export interface ExpGainInput {
  /** The defeated species' base_experience. */
  baseExperience: number
  /** The defeated species' level. */
  level: number
  isTrainerBattle: boolean
  /** How many of the winner's party get a share. 1 if nobody else participated. */
  participants: number
  hasLuckyEgg: boolean
}

/**
 * EXP awarded for one defeat: `floor(a * b * L / (7 * s))`, Gen I-IV's shared
 * formula (a = 1 wild / 1.5 trainer, b = base experience, L = defeated level,
 * s = participants sharing the reward), then Lucky Egg's flat ×1.5.
 *
 * NOT MODELLED: the Exp Share item's own split (its exact mechanics changed
 * across Gen 1-4 and are a separate, more involved question), and Gen 4's
 * "traded from another game" ×1.5 some sources also report — kept out rather
 * than guessed at.
 */
export function expGainedFromDefeat(input: ExpGainInput): number {
  const a = input.isTrainerBattle ? 1.5 : 1
  const s = Math.max(1, input.participants)
  let exp = Math.floor((a * input.baseExperience * input.level) / (7 * s))
  if (input.hasLuckyEgg) exp = Math.floor(exp * 1.5)
  return exp
}
