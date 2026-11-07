/**
 * #22 Rental set comparator: the Battle Factory's rental pool for a round, and
 * any of its sets side by side at the stats you would actually rent them with.
 *
 * PURE, AND UI-FREE. The pools and IVs are the games' own:
 *
 *   Emerald (pokeemerald src/battle_factory.c): sInitialRentalMonRanges picks the
 *   slice of gBattleFrontierMons a round draws from (Level 50 and Open Level),
 *   GetFactoryMonId the round, capped at the 8th; sFixedIVTable the one IV every
 *   stat gets (battle_factory_screen.c: the round's, or the next round's for the
 *   "better" rentals a long rental record earns). GetFactoryMonFixedIV reads one
 *   row past the table for round 9 -- the decomp notes it lands above 31, which
 *   the game takes as random IVs -- and the tool keeps that.
 *
 *   Platinum (pokeplatinum src/overlay104/battle_factory_helpers.c): sLevel50Pools
 *   and sOpenLevelPlayerPools, set IDs and one IV per round, capped at
 *   FACTORY_MAX_DISTINCT_ROUNDS (8); an "upgraded" rental comes from the next
 *   round's pool, how many of the six by sTradeCountsNeededForUpgrades.
 *
 *   HeartGold/SoulSilver: the bundle reuses Platinum's pool (its own is not
 *   extracted), and so does this -- said on the page.
 *
 * Indexes here are positions in the bundle's `sets` (Emerald: the FRONTIER_MON_
 * order; Platinum: set ID - 1, frontier_pokemon.order without its dummy).
 */

import { computeStat, type NatureMods } from '../../team-builder/statMath'

export type RentalGame = 'emerald' | 'platinum' | 'heartgold-soulsilver'
export const RENTAL_GAMES: readonly RentalGame[] = ['emerald', 'platinum', 'heartgold-soulsilver']

export interface RentalPool {
  /** Inclusive bundle indexes. */
  from: number
  to: number
  /** The one IV every stat gets, or 'random'. */
  iv: number | 'random'
  level: number
}

const EMERALD_RANGES: Record<'l50' | 'open', readonly (readonly [number, number])[]> = {
  l50: [
    [110, 199],
    [162, 266],
    [267, 371],
    [372, 467],
    [468, 563],
    [564, 659],
    [660, 755],
    [372, 849],
  ],
  open: [
    [372, 467],
    [468, 563],
    [564, 659],
    [660, 755],
    [372, 881],
    [372, 881],
    [372, 881],
    [372, 881],
  ],
}
const EMERALD_IV = [3, 6, 9, 12, 15, 21, 31, 31] // sFixedIVTable[n][0]

const PLATINUM_POOLS: Record<
  'l50' | 'open',
  readonly { min: number; max: number; iv: number; upgrade: boolean }[]
> = {
  l50: [
    { min: 1, max: 150, iv: 0, upgrade: true },
    { min: 151, max: 250, iv: 4, upgrade: true },
    { min: 251, max: 350, iv: 8, upgrade: true },
    { min: 351, max: 486, iv: 12, upgrade: true },
    { min: 487, max: 622, iv: 16, upgrade: true },
    { min: 623, max: 758, iv: 20, upgrade: true },
    { min: 759, max: 894, iv: 24, upgrade: true },
    { min: 351, max: 950, iv: 31, upgrade: false },
  ],
  open: [
    { min: 351, max: 486, iv: 0, upgrade: true },
    { min: 487, max: 622, iv: 4, upgrade: true },
    { min: 623, max: 758, iv: 8, upgrade: true },
    { min: 759, max: 894, iv: 12, upgrade: true },
    { min: 623, max: 950, iv: 16, upgrade: true },
    { min: 623, max: 950, iv: 20, upgrade: true },
    { min: 623, max: 950, iv: 24, upgrade: true },
    { min: 351, max: 950, iv: 31, upgrade: false },
  ],
}
/** Platinum: trades needed before 1, 2, 3, 4, 5 of the six rentals come from the next pool. */
export const PLATINUM_UPGRADE_TRADES = [6, 13, 20, 27, 34]

/** Emerald's GetFactoryMonFixedIV, out-of-bounds read included. */
function emeraldIv(challengeNum: number): number | 'random' {
  if (challengeNum > EMERALD_IV.length) return EMERALD_IV[EMERALD_IV.length - 1]
  if (challengeNum === EMERALD_IV.length) return 'random'
  return EMERALD_IV[challengeNum]
}

/** The pool a rental is drawn from. `round` is 1-based (a round is seven battles). */
export function rentalPool(
  game: RentalGame,
  open: boolean,
  round: number,
  upgraded: boolean,
): RentalPool {
  const n = round - 1
  const level = open ? 100 : 50
  if (game === 'emerald') {
    const ranges = EMERALD_RANGES[open ? 'open' : 'l50']
    const r = n < 7 ? (upgraded ? n + 1 : n) : 7
    const [from, to] = ranges[r]
    return { from, to, iv: emeraldIv(upgraded ? n + 1 : n), level }
  }
  const pools = PLATINUM_POOLS[open ? 'open' : 'l50']
  const base = pools[Math.min(n, pools.length - 1)]
  const p = upgraded && base.upgrade ? pools[Math.min(n, pools.length - 1) + 1] : base
  return { from: p.min - 1, to: p.max - 1, iv: p.iv, level }
}

/** Whether "upgraded" changes anything this round (Platinum's last pool cannot be upgraded). */
export function canUpgrade(game: RentalGame, open: boolean, round: number): boolean {
  if (game === 'emerald') return true
  const pools = PLATINUM_POOLS[open ? 'open' : 'l50']
  return pools[Math.min(round - 1, pools.length - 1)].upgrade
}

export const STAT_KEYS = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const

/** A set's six stats at the pool's level, every IV at `iv`. */
export function rentalStats(
  base: Record<string, number>,
  evs: Record<string, number>,
  nature: NatureMods,
  level: number,
  iv: number,
): number[] {
  const individual = Object.fromEntries(STAT_KEYS.map((k) => [k, iv]))
  return STAT_KEYS.map((key) =>
    computeStat({
      generation: 3,
      level,
      base: base[key] ?? 0,
      key,
      effort: evs,
      individual,
      nature,
    }),
  )
}
