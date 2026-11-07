/**
 * #18 Contest stats plan: feed Pokéblocks (Gen 3) or Poffins (Gen 4) in order
 * and read the conditions and sheen after each, until the sheen is full.
 *
 * PURE, AND UI-FREE. The two routines differ, and the difference is the point:
 *
 *   Gen 3 (pokeemerald use_pokeblock.c AddPokeblockToConditions +
 *   CalculatePokeblockEffectiveness, pokeblock.c PokeblockGetGain): the block's
 *   flavours go straight on. The NATURE first scores the whole block -- each
 *   flavour present counts +1 if liked, -1 if disliked -- and only in that
 *   direction does it act: a block the Pokémon "happily ate" adds 10% (rounded)
 *   to the liked flavour; one it "disdainfully ate" takes 10% off the disliked;
 *   a block scoring 0 gets no nature effect at all, even with a liked flavour in it.
 *
 *   Gen 4 (pokeplatinum poffin_case/main.c PoffinCase_UpdateMonContestStats):
 *   liked flavour x1.1 and disliked x0.9, both truncated, every time. The game
 *   multiplies in 32-bit float (1.1f, 0.9f); for every flavour 0-255 that gives
 *   the same whole number as this double arithmetic (checked exhaustively).
 *
 * Both: each condition caps at 255, sheen adds the block's feel / the Poffin's
 * smoothness and caps at 255, and at 255 sheen the Pokémon will not eat.
 */

export type ContestRules = 'gen3' | 'gen4'
export const CONDITIONS = ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough'] as const
/** Flavour index per condition, in the same order: spicy, dry, sweet, bitter, sour. */
export const FLAVOR_KEYS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const
export const MAX = 255

export interface Treat {
  /** Spicy, dry, sweet, bitter, sour. */
  flavors: number[]
  /** Sheen it adds: a Pokéblock's feel, a Poffin's smoothness. */
  feel: number
}

export interface Taste {
  liked: number | null
  disliked: number | null
}

/** From a nature's liked and disliked flavour names; a neutral nature likes and hates the same. */
export function tasteOf(likes: string | null, hates: string | null): Taste {
  const i = FLAVOR_KEYS.indexOf(likes as (typeof FLAVOR_KEYS)[number])
  const j = FLAVOR_KEYS.indexOf(hates as (typeof FLAVOR_KEYS)[number])
  if (i < 0 || j < 0 || i === j) return { liked: null, disliked: null }
  return { liked: i, disliked: j }
}

export interface State {
  conditions: number[]
  sheen: number
}

/** The condition gains one treat gives, before the 255 caps. */
export function gains(rules: ContestRules, taste: Taste, t: Treat): number[] {
  const g = t.flavors.slice(0, 5)
  if (taste.liked == null || taste.disliked == null) return g
  if (rules === 'gen4') {
    g[taste.liked] = Math.trunc(g[taste.liked] * 1.1)
    g[taste.disliked] = Math.trunc(g[taste.disliked] * 0.9)
    return g
  }
  let score = 0
  t.flavors.forEach((x, i) => {
    if (x > 0) score += x * (i === taste.liked ? 1 : i === taste.disliked ? -1 : 0)
  })
  if (score === 0) return g
  const direction = score > 0 ? 1 : -1
  const which = direction > 0 ? taste.liked : taste.disliked
  const x = t.flavors[which]
  const boost = Math.trunc(x / 10) + (x % 10 >= 5 ? 1 : 0)
  g[which] += boost * direction
  return g
}

export interface Step {
  /** Which plan row this serving came from. */
  row: number
  gain: number[]
  after: State
}

export interface Fed {
  steps: Step[]
  final: State
  /** Servings left uneaten because the sheen filled up. */
  refused: number
}

/** Feed the rows in order, each `count` times; stops when the sheen is full. */
export function feed(
  rules: ContestRules,
  taste: Taste,
  start: State,
  rows: { treat: Treat; count: number }[],
): Fed {
  let state: State = { conditions: [...start.conditions], sheen: start.sheen }
  const steps: Step[] = []
  let refused = 0
  rows.forEach(({ treat, count }, row) => {
    for (let k = 0; k < count; k++) {
      if (state.sheen >= MAX) {
        refused++
        continue
      }
      const gain = gains(rules, taste, treat)
      state = {
        conditions: state.conditions.map((c, i) => Math.max(0, Math.min(MAX, c + gain[i]))),
        sheen: Math.min(MAX, state.sheen + treat.feel),
      }
      steps.push({ row, gain, after: state })
    }
  })
  return { steps, final: state, refused }
}

/** How many of one treat a Pokémon at this sheen eats before it is full (Infinity if feel is 0). */
export function servingsUntilFull(sheen: number, feel: number): number {
  if (sheen >= MAX) return 0
  return feel <= 0 ? Infinity : Math.ceil((MAX - sheen) / feel)
}
