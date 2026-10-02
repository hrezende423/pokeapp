/**
 * THE MATCHUP MATRIX (M1, M2, M4): every one of my Pokemon against every one of
 * theirs, one-on-one from the current field state.
 *
 * A CELL is the two best moves (one each way), their damage ranges, who moves
 * first and the hits to KO each way -- and a VERDICT, decided from the exchange
 * under the pessimistic and the optimistic reading of every range (rolls, spread
 * ranges, speed ties):
 *   wins   I KO it first in every case, taking less than half my HP;
 *   trades I KO it first in every case, but take half my HP or more doing it;
 *   loses  it KOs me first in every case;
 *   roll   the winner depends on rolls, crits, a speed tie or a spread range.
 * Accuracy and crits are NOT in the verdict (it is the deterministic exchange);
 * they are in the KO chances the cell also carries.
 */

import type { BattleData } from '../battleData'
import type { BattlerSpec } from '../battler'
import { analyzeMove, type MatchField, type MoveDamage } from '../damage'
import type { GameContext } from '../game'
import type { Range } from '../range'
import { firstProbability, noMods, type SpeedMods } from '../speed'

export type Verdict = 'wins' | 'trades' | 'loses' | 'roll'

export interface Side1v1 {
  status: import('../../calculators/damage').StatusId
  boosts: import('../../calculators/damage').Boosts
  hpPct: number | null
}

export interface MatrixCell {
  mineKey: string
  theirsKey: string
  myBest: MoveDamage | null
  theirBest: MoveDamage | null
  myMoves: MoveDamage[]
  theirMoves: MoveDamage[]
  /** P(I move first), with each side's best move. */
  first: Range
  verdict: Verdict
  /** HP% I am left with in the pessimistic exchange (when I win it). */
  hpLeft: number
  why: string
  ceiling: boolean
}

export interface MatrixInput {
  ctx: GameContext
  data: BattleData
  mine: BattlerSpec[]
  theirs: BattlerSpec[]
  field: MatchField
  badges: Set<string>
  mineState?: Record<string, Side1v1>
  theirsState?: Record<string, Side1v1>
  residual?: boolean
}

function best(moves: MoveDamage[]): MoveDamage | null {
  const ok = moves.filter((m) => m.status === 'ok')
  if (!ok.length) return null
  // The best move is the one that KOs in the fewest hits (worst case), then the most expected damage.
  return ok.reduce((b, m) =>
    m.hitsToKO.max < b.hitsToKO.max ||
    (m.hitsToKO.max === b.hitsToKO.max && m.expectedPct > b.expectedPct)
      ? m
      : b,
  )
}

function speedMods(s: Side1v1 | undefined, field: MatchField, side: 'mine' | 'theirs'): SpeedMods {
  return {
    ...noMods(field.weather),
    stage: s?.boosts.spe ?? 0,
    paralyzed: s?.status === 'par',
    statused: (s?.status ?? 'healthy') !== 'healthy',
    tailwind: !!field.sides[side].tailwind,
  }
}

export function matrixCell(
  inp: MatrixInput,
  mine: BattlerSpec,
  theirs: BattlerSpec,
  full = false,
): MatrixCell {
  const { ctx, data, field, badges } = inp
  const ms = inp.mineState?.[mine.key]
  const ts = inp.theirsState?.[theirs.key]
  const cond = (s?: Side1v1) => ({
    status: s?.status ?? 'healthy',
    boosts: s?.boosts ?? {},
    currentHp: null,
    abilityOn: false,
    hpPct: s?.hpPct ?? null,
  })
  const myMoves = mine.moves.map((id) =>
    analyzeMove({
      ctx,
      data,
      attacker: mine,
      defender: theirs,
      moveId: id,
      attackerSide: 'mine',
      field,
      atk: cond(ms),
      def: cond(ts),
      badges,
      fast: !full,
      residual: inp.residual,
      uses: 4,
    }),
  )
  const theirMoves = theirs.moves.map((id) =>
    analyzeMove({
      ctx,
      data,
      attacker: theirs,
      defender: mine,
      moveId: id,
      attackerSide: 'theirs',
      field,
      atk: cond(ts),
      def: cond(ms),
      badges,
      fast: !full,
      residual: inp.residual,
      uses: 4,
    }),
  )
  const myBest = best(myMoves)
  const theirBest = best(theirMoves)
  const first = firstProbability(
    ctx,
    data,
    mine,
    speedMods(ms, field, 'mine'),
    myBest?.priority ?? 0,
    theirs,
    speedMods(ts, field, 'theirs'),
    theirBest?.priority ?? 0,
    badges,
    field.trickRoom,
  )
  const ceiling = mine.spread.ceiling || theirs.spread.ceiling
  const nMe = myBest?.hitsToKO ?? { min: Infinity, max: Infinity }
  const nThem = theirBest?.hitsToKO ?? { min: Infinity, max: Infinity }
  // Pessimistic: my slowest KO, their fastest, and I move second unless I always move first.
  const pessFirst = first.min >= 1
  const optFirst = first.max > 0
  const winPess =
    Number.isFinite(nMe.max) && (pessFirst ? nMe.max <= nThem.min : nMe.max < nThem.min)
  const winOpt = Number.isFinite(nMe.min) && (optFirst ? nMe.min <= nThem.max : nMe.min < nThem.max)
  // How many of their hits I take before my last hit lands (pessimistic).
  const hitsTaken = winPess ? (pessFirst ? nMe.max - 1 : nMe.max) : 0
  const taken = Math.min(100, hitsTaken * (theirBest?.percent.max ?? 0))
  const hpLeft = Math.max(0, (ms?.hpPct ?? 100) - taken)
  let verdict: Verdict
  let why: string
  if (winPess) {
    verdict = taken >= 50 ? 'trades' : 'wins'
    why = `${nMe.max === 1 ? 'OHKO' : `${nMe.max}HKO`} at worst${pessFirst ? ', moving first' : ''}; you take up to ${taken.toFixed(0)}%`
  } else if (!winOpt) {
    verdict = 'loses'
    why = Number.isFinite(nThem.max)
      ? `It KOs in ${nThem.max === 1 ? 'one hit' : `${nThem.max} hits`} before you can`
      : 'You cannot KO it'
  } else {
    verdict = 'roll'
    const reasons: string[] = []
    if (first.min < 1 && first.max > 0)
      reasons.push(first.min === first.max ? 'a speed tie' : 'speed depends on the spread')
    if (nMe.min !== nMe.max) reasons.push(`your KO is ${nMe.min}-${nMe.max} hits`)
    if (nThem.min !== nThem.max) reasons.push(`its KO is ${nThem.min}-${nThem.max} hits`)
    why = `Depends on ${reasons.join(', ') || 'rolls'}`
  }
  return {
    mineKey: mine.key,
    theirsKey: theirs.key,
    myBest,
    theirBest,
    myMoves,
    theirMoves,
    first,
    verdict,
    hpLeft,
    why,
    ceiling,
  }
}

export interface Matrix {
  cells: MatrixCell[][]
  /** M4: their Pokemon I have no winning (or trading) answer to. */
  unanswered: string[]
  /** M4: my Pokemon with no safe (winning) matchup. */
  noSafeMatchup: string[]
}

export function computeMatrix(inp: MatrixInput): Matrix {
  const cells = inp.mine.map((m) => inp.theirs.map((t) => matrixCell(inp, m, t)))
  const unanswered = inp.theirs
    .filter(
      (_, j) => !cells.some((row) => row[j].verdict === 'wins' || row[j].verdict === 'trades'),
    )
    .map((t) => t.key)
  const noSafeMatchup = inp.mine
    .filter((_, i) => !cells[i].some((c) => c.verdict === 'wins'))
    .map((m) => m.key)
  return { cells, unanswered, noSafeMatchup }
}
