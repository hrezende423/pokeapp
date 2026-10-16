/**
 * #6 Speed EV minimizer: the least Speed effort that outspeeds a target.
 *
 * PURE, AND UI-FREE. The solver is the battle engine's `speedThreshold`
 * (battle/speed.ts, Team Matchup's V4): a binary search over Speed effort on the
 * game's own effective-Speed routine -- EVs in steps of 4 in Gen 3-4 (only every
 * fourth point counts), Stat Exp one point at a time in Gen 1-2 -- with the
 * current nature and with a +Speed one, plus the lowest level that would do it.
 * This file only reads the two rows.
 *
 * "OUTSPEEDS" MEANS STRICTLY FASTER. An exact tie is a coin flip, not a win, so
 * when the best reachable is a tie the result says so instead of a number.
 */

import type { BattleData } from '../../battle/battleData'
import type { GameContext } from '../../battle/game'
import { speedThreshold, type SpeedThreshold } from '../../battle/speed'
import { rowToSpec, type TierField, type TierRow } from '../speed-tiers/speedTiersMath'

export type MinimizerOutcome =
  { ok: true; threshold: SpeedThreshold } | { ok: false; reason: string }

export function readMinimizer(
  ctx: GameContext,
  data: BattleData,
  mine: TierRow,
  target: TierRow,
  field: TierField,
): MinimizerOutcome {
  const a = rowToSpec(ctx, mine, 1, field, 'Your Pokémon')
  if (!a.ok) return a
  const b = rowToSpec(ctx, target, 2, field, 'The target')
  if (!b.ok) return b
  return {
    ok: true,
    threshold: speedThreshold(ctx, data, a.spec, a.mods, b.spec, b.mods, new Set()),
  }
}
