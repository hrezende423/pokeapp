/**
 * Catch probability, Gen 1-4.
 *
 * PURE, AND UI-FREE, same discipline as the damage engine (./damage).
 *
 * ONE FORMULA FOR ALL FOUR GENERATIONS, AND THAT IS A STATED SIMPLIFICATION, NOT
 * A CLAIM OF BYTE-EXACT ACCURACY. The shake-value algorithm below (the
 * 1048560 / 16711680 constants) is Generation III's, and is still the one the
 * games use today. Generation I-II ran a coarser, single-byte version of the
 * same idea — same "remaining HP against catch rate against ball" shape, a
 * cruder random check — and the exact byte-level differences are not confident
 * enough here to encode as fact rather than reproduce as a guess. Rather than
 * assert a specific Gen 1-2 algorithm this file is not sure of, it uses the one
 * formula everywhere and says so, the same call the damage calculator makes
 * about the 16-bit truncation order it does not reproduce either. Good enough
 * for "roughly how many balls should I expect to throw", not for settling a
 * frame-perfect dispute about a Gen 1 catch.
 *
 * WHAT IS NOT MODELLED: Master Ball aside, only Poké/Great/Ultra Ball bonuses —
 * no Safari Ball (a different mechanic entirely, no fleeing check), no
 * conditional balls (Net, Dive, Repeat, Timer, Nest, Heavy) since none of those
 * exist in Gen 1-4 anyway. Status bonus is the two flat tiers every generation
 * in scope shares (sleep/freeze ×2, paralysis/poison/burn ×1.5); it does not
 * model a status wearing off mid-throw.
 */

export type PokeBall = 'poke' | 'great' | 'ultra' | 'master'
export type CatchStatus = 'none' | 'paralyze-poison-burn' | 'sleep-freeze'

export const BALL_BONUS: Record<PokeBall, number> = {
  poke: 1,
  great: 1.5,
  ultra: 2,
  // Master Ball never rolls the formula at all — see catchProbability below.
  master: 255,
}

export const STATUS_BONUS: Record<CatchStatus, number> = {
  none: 1,
  'paralyze-poison-burn': 1.5,
  'sleep-freeze': 2,
}

export interface CatchRateInput {
  currentHp: number
  maxHp: number
  /** The species' capture_rate field, 3-255. */
  captureRate: number
  ball: PokeBall
  status: CatchStatus
}

export interface CatchRateResult {
  /** True when the ball always succeeds (Master Ball, or the modified rate hit the 255 cap). */
  guaranteed: boolean
  /** 0-1. */
  probability: number
  /** The modified catch value ("a" in Bulbapedia's own notation), for the curious. */
  a: number
}

export function catchProbability(input: CatchRateInput): CatchRateResult {
  if (input.ball === 'master') return { guaranteed: true, probability: 1, a: 255 }
  if (input.maxHp <= 0) return { guaranteed: false, probability: 0, a: 0 }

  const hpTerm = Math.max(1, 3 * input.maxHp - 2 * Math.min(input.currentHp, input.maxHp))
  const modified = Math.floor(
    (hpTerm * input.captureRate * BALL_BONUS[input.ball]) / (3 * input.maxHp),
  )
  const a = Math.min(255, Math.floor(modified * STATUS_BONUS[input.status]))

  if (a >= 255) return { guaranteed: true, probability: 1, a: 255 }
  if (a <= 0) return { guaranteed: false, probability: 0, a: 0 }

  const shakeValue = Math.min(65535, Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a))))
  const shakeProbability = shakeValue / 65536
  // Four shake checks must all pass; the games stop at the first failure, but the
  // overall catch probability is the same either way.
  return { guaranteed: false, probability: shakeProbability ** 4, a }
}

/** "1 in N throws", rounded — the more intuitive readout beside a raw percentage. */
export function oneInN(probability: number): number | null {
  if (probability <= 0) return null
  return Math.round(1 / probability)
}
