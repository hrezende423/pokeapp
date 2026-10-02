/**
 * SWITCHING (P1, P6, P7, P8): what happens when one of mine comes in on the
 * opponent's active Pokemon, which of mine can do it safely, where a boosting
 * move has room to work, and what U-turn and Baton Pass open up.
 *
 * Everything is one-on-one from the matrix's own cells (matrix.ts), with the
 * entry cost -- the hit taken on the way in and the hazards on my side -- taken
 * off the switch-in's HP first. The pessimistic reading is the one shown as
 * "safe": the worst roll of the opponent's strongest move, the switch-in's
 * least bulky corner.
 */

import { getAbility, getMove, getType, resolveTypesForGeneration } from '../../../data'
import type { Boosts } from '../../calculators/damage'
import { STAT_IDS, statAt, varietyOfSpec, type BattlerSpec } from '../battler'
import { analyzeMove, type MatchField, type MoveDamage } from '../damage'
import { moveSem } from '../engine/moveSem'
import { typeMult } from '../engine/turn'
import type { GameContext } from '../game'
import type { Range } from '../range'
import { matrixCell, type MatrixCell, type MatrixInput, type Side1v1, type Verdict } from './matrix'

const VERDICT_RANK: Record<Verdict, number> = { wins: 0, trades: 1, roll: 2, loses: 3 }

// ---------------------------------------------------------------- hazards

export interface HazardCost {
  /** % of max HP lost to Spikes and Stealth Rock on entry (low..high HP corner). */
  percent: Range
  /** Toxic Spikes status on entry, if any. */
  status: 'psn' | 'tox' | null
  notes: string[]
}

/**
 * Entry hazards on `side`, as the turn engine applies them (engine/turn.ts
 * switchIn): Spikes 1/8, 1/6, 1/4 by layers (Gen 2 one layer), Stealth Rock
 * 1/8 x Rock effectiveness, Toxic Spikes poison / bad poison -- none for a
 * Flying type, Levitate, or (damage only) Magic Guard.
 */
export function hazardCost(
  ctx: GameContext,
  spec: BattlerSpec,
  field: MatchField,
  side: 'mine' | 'theirs',
): HazardCost {
  const sd = field.sides[side] as MatchField['sides']['mine'] & { toxicSpikes?: number }
  const gen = ctx.generation
  const types = resolveTypesForGeneration(varietyOfSpec(spec), gen)
  const typeNames = types.map((t) => getType(t.type_id)?.name ?? '')
  const ab =
    ctx.hasAbilities && spec.abilityId != null ? (getAbility(spec.abilityId)?.name ?? '') : ''
  const grounded = !typeNames.includes('flying') && ab !== 'levitate'
  const notes: string[] = []
  const at = (hp: number) => {
    let dmg = 0
    if (ab === 'magic-guard') return 0
    if ((sd.spikes ?? 0) > 0 && grounded && gen >= 2) {
      const layers = gen === 2 ? 1 : Math.min(3, sd.spikes)
      dmg += Math.max(1, Math.floor(hp / (layers === 1 ? 8 : layers === 2 ? 6 : 4)))
    }
    if (sd.stealthRock && gen >= 4) {
      const eff = typeMult(
        'rock',
        types.map((t) => t.type_id),
        gen,
      )
      dmg += Math.max(1, Math.floor((hp * eff) / 8))
    }
    return dmg
  }
  const lo = statAt(spec, gen, 'hp', 'low')
  const hi = statAt(spec, gen, 'hp', 'high')
  const pLo = (100 * at(lo)) / lo
  const pHi = (100 * at(hi)) / hi
  if ((sd.spikes ?? 0) > 0 && !grounded) notes.push('Immune to Spikes')
  if (ab === 'magic-guard') notes.push('Magic Guard: no hazard damage')
  const tSpikes = sd.toxicSpikes ?? 0
  const status =
    gen >= 4 &&
    tSpikes > 0 &&
    grounded &&
    !typeNames.includes('poison') &&
    !typeNames.includes('steel')
      ? tSpikes >= 2
        ? 'tox'
        : 'psn'
      : null
  if (gen >= 4 && tSpikes > 0 && grounded && typeNames.includes('poison'))
    notes.push('Absorbs Toxic Spikes')
  return { percent: { min: Math.min(pLo, pHi), max: Math.max(pLo, pHi) }, status, notes }
}

// ------------------------------------------------------- P1 / P6 switch-ins

export interface EntryHit {
  moveId: number
  name: string
  /** AI chance it picks this move (from the prediction), or null when not predicted. */
  p: number | null
  damage: MoveDamage
}

export interface SwitchInRow {
  mineKey: string
  hits: EntryHit[]
  hazards: HazardCost
  /** Worst entry: the opponent's strongest move into it, plus hazards (% of max HP). */
  worstEntry: Range
  /** Entry weighted by the AI's predicted move odds (or the worst move when there is no prediction). */
  expectedEntry: number
  /** The one-on-one from the HP left after the worst entry. */
  after: MatrixCell
  safe: boolean
  why: string
}

export interface SwitchInput extends MatrixInput {
  /** The opponent's active Pokemon. */
  foe: BattlerSpec
  /** My Pokemon on the field now (it cannot switch into itself). */
  activeKey: string | null
  /** P3: the AI's predicted move odds by move id, when a prediction was run. */
  predicted?: Map<number, number>
}

/** P1: every possible switch-in on the opponent's active Pokemon. P6: the safe ones ranked first. */
export function switchInTable(inp: SwitchInput): SwitchInRow[] {
  const { ctx, data, field, badges, foe } = inp
  const rows: SwitchInRow[] = []
  for (const mine of inp.mine) {
    if (mine.key === inp.activeKey) continue
    const ms = inp.mineState?.[mine.key]
    if (ms?.hpPct === 0) continue
    const hits: EntryHit[] = foe.moves.map((id) => ({
      moveId: id,
      name: getMove(id)?.display_name ?? `#${id}`,
      p: inp.predicted ? (inp.predicted.get(id) ?? 0) : null,
      damage: analyzeMove({
        ctx,
        data,
        attacker: foe,
        defender: mine,
        moveId: id,
        attackerSide: 'theirs',
        field,
        atk: {
          status: inp.theirsState?.[foe.key]?.status ?? 'healthy',
          boosts: inp.theirsState?.[foe.key]?.boosts ?? {},
          currentHp: null,
          abilityOn: false,
        },
        // Coming in: no boosts of its own yet, its status carried.
        def: { status: ms?.status ?? 'healthy', boosts: {}, currentHp: null, abilityOn: false },
        badges,
        fast: true,
      }),
    }))
    const hazards = hazardCost(ctx, mine, field, 'mine')
    const dmgHits = hits.filter((h) => h.damage.status === 'ok')
    const worstMove = dmgHits.length ? Math.max(...dmgHits.map((h) => h.damage.percent.max)) : 0
    const bestMove = dmgHits.length ? Math.max(...dmgHits.map((h) => h.damage.percent.min)) : 0
    const worstEntry = { min: bestMove + hazards.percent.min, max: worstMove + hazards.percent.max }
    const weighted = inp.predicted
      ? hits.reduce(
          (s, h) => s + (h.p ?? 0) * (h.damage.status === 'ok' ? h.damage.expectedPct : 0),
          0,
        ) +
        (hazards.percent.min + hazards.percent.max) / 2
      : worstMove + hazards.percent.max
    const startHp = ms?.hpPct ?? 100
    const left = Math.max(0, startHp - worstEntry.max)
    const state: Record<string, Side1v1> = {
      ...inp.mineState,
      [mine.key]: {
        status: hazards.status ?? ms?.status ?? 'healthy',
        boosts: {},
        hpPct: Math.max(1, left),
      },
    }
    const after = matrixCell({ ...inp, mineState: state }, mine, foe)
    const survives = left > 0
    const safe =
      survives && worstEntry.max < 50 && (after.verdict === 'wins' || after.verdict === 'trades')
    const why = !survives
      ? `Can be KOed on the way in (up to ${worstEntry.max.toFixed(0)}%)`
      : `Takes up to ${worstEntry.max.toFixed(0)}% coming in, then ${after.verdict === 'wins' ? 'wins' : after.verdict === 'trades' ? 'trades' : after.verdict === 'loses' ? 'loses' : 'is a coin flip'}: ${after.why}`
    rows.push({
      mineKey: mine.key,
      hits,
      hazards,
      worstEntry,
      expectedEntry: weighted,
      after,
      safe,
      why,
    })
  }
  return rows.sort(
    (a, b) =>
      Number(b.safe) - Number(a.safe) ||
      VERDICT_RANK[a.after.verdict] - VERDICT_RANK[b.after.verdict] ||
      a.worstEntry.max - b.worstEntry.max,
  )
}

// ------------------------------------------------------- P7 setup finder

export interface SetupWindow {
  mineKey: string
  moveId: number
  moveName: string
  /** The stat stages one use gives. */
  boosts: Boosts
  /** The opponent it sets up on. */
  onKey: string
  /** Uses it can make before the opponent can KO it (pessimistic); 0 = none. */
  safeUses: number
  /** HP % left after those uses (pessimistic). */
  hpAfter: number
  /** After the boosts: the opponent Pokemon it then beats one-on-one (wins verdict). */
  sweeps: string[]
  /** Its verdicts against each opponent after setting up. */
  cells: MatrixCell[]
  why: string
}

function addBoosts(a: Boosts, b: Boosts, times: number): Boosts {
  const out: Boosts = { ...a }
  for (const k of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const v = (a[k] ?? 0) + (b[k] ?? 0) * times
    if (v) out[k] = Math.max(-6, Math.min(6, v))
  }
  return out
}

/** A self-boosting move's stage changes (Swords Dance, Dragon Dance, Calm Mind, Curse...). */
export function boostOf(
  ctx: GameContext,
  data: MatrixInput['data'],
  moveId: number,
): Boosts | null {
  const sem = moveSem(ctx.generation, data, moveId)
  if (sem.bellyDrum) return { atk: 6 }
  if (!sem.stats || sem.stats.target !== 'self' || sem.stats.chance < 1) return null
  const out: Boosts = {}
  let any = false
  for (const c of sem.stats.changes) {
    if (c.stat === 'acc' || c.stat === 'eva') continue
    out[c.stat] = (out[c.stat] ?? 0) + c.delta
    if (c.delta > 0) any = true
  }
  return any ? out : null
}

/**
 * P7: for each of my Pokemon with a boosting move, each opponent it could set up
 * on -- how many boosts it can take before that opponent can KO it, and which
 * of their team it beats afterwards.
 */
export function setupWindows(inp: MatrixInput): SetupWindow[] {
  const out: SetupWindow[] = []
  for (const mine of inp.mine) {
    const ms = inp.mineState?.[mine.key]
    if (ms?.hpPct === 0) continue
    for (const id of mine.moves) {
      const boost = boostOf(inp.ctx, inp.data, id)
      if (!boost) continue
      for (const foe of inp.theirs) {
        if (inp.theirsState?.[foe.key]?.hpPct === 0) continue
        const base = matrixCell(inp, mine, foe)
        const per = base.theirBest?.percent.max ?? 0
        const startHp = ms?.hpPct ?? 100
        // Uses it survives: it must still be standing to attack after the last one.
        let uses = 0
        if (per <= 0) uses = 3
        else while (startHp - per * (uses + 1) > 0 && uses < 3) uses++
        if (uses === 0) continue
        const boosts = addBoosts(ms?.boosts ?? {}, boost, uses)
        const hpAfter = Math.max(1, startHp - per * uses)
        const mineState = {
          ...inp.mineState,
          [mine.key]: { status: ms?.status ?? 'healthy', boosts, hpPct: hpAfter },
        }
        const cells = inp.theirs.map((t) => matrixCell({ ...inp, mineState }, mine, t))
        const sweeps = cells.filter((c) => c.verdict === 'wins').map((c) => c.theirsKey)
        const baseWins = inp.theirs.filter(
          (t) => matrixCell(inp, mine, t).verdict === 'wins',
        ).length
        if (sweeps.length <= baseWins) continue
        const name = getMove(id)?.display_name ?? `#${id}`
        out.push({
          mineKey: mine.key,
          moveId: id,
          moveName: name,
          boosts,
          onKey: foe.key,
          safeUses: uses,
          hpAfter,
          sweeps,
          cells,
          why: `${uses}x ${name} on it (it does up to ${per.toFixed(0)}% a turn), then beats ${sweeps.length} of ${inp.theirs.length} (from ${baseWins})`,
        })
      }
    }
  }
  return out.sort((a, b) => b.sweeps.length - a.sweeps.length || b.hpAfter - a.hpAfter)
}

// --------------------------------------------------- P8 U-turn / Baton Pass

export interface PivotOption {
  userKey: string
  moveId: number
  kind: 'u-turn' | 'baton-pass'
  moveName: string
  /** P(the user moves before the opponent). */
  first: Range
  /** U-turn's own damage on the opponent. */
  damage: MoveDamage | null
  /** Who it brings in, best first -- for free if the user moves second (U-turn) or after the pass. */
  landing: { mineKey: string; cell: MatrixCell; free: boolean }[]
  /** Baton Pass: the boosts the user can build first (from its own setup moves) and pass. */
  passes: Boosts | null
  why: string
}

/** P8: U-turn and Baton Pass from each of mine on the opponent's active Pokemon. */
export function pivotOptions(inp: MatrixInput, foe: BattlerSpec): PivotOption[] {
  const out: PivotOption[] = []
  for (const user of inp.mine) {
    const us = inp.mineState?.[user.key]
    if (us?.hpPct === 0) continue
    for (const id of user.moves) {
      const sem = moveSem(inp.ctx.generation, inp.data, id)
      if (!sem.pivot) continue
      const base = matrixCell(inp, user, foe)
      const name = getMove(id)?.display_name ?? `#${id}`
      let passes: Boosts | null = null
      if (sem.pivot === 'baton-pass') {
        // The user's own boosting moves, used as many times as it survives (one use each turn).
        const setup = setupWindows({ ...inp, mine: [user], theirs: [foe] }).find(
          (w) => w.onKey === foe.key,
        )
        passes = setup?.boosts ?? null
      }
      const landing = inp.mine
        .filter((m) => m.key !== user.key && inp.mineState?.[m.key]?.hpPct !== 0)
        .map((m) => {
          const ms = inp.mineState?.[m.key]
          const boosts = passes ? addBoosts(ms?.boosts ?? {}, passes, 1) : (ms?.boosts ?? {})
          const state = {
            ...inp.mineState,
            [m.key]: { status: ms?.status ?? 'healthy', boosts, hpPct: ms?.hpPct ?? 100 },
          }
          const cell = matrixCell({ ...inp, mineState: state }, m, foe)
          // U-turn moving second: the opponent has already attacked, the switch-in comes in free.
          return { mineKey: m.key, cell, free: sem.pivot === 'baton-pass' || base.first.max < 1 }
        })
        .sort(
          (a, b) =>
            VERDICT_RANK[a.cell.verdict] - VERDICT_RANK[b.cell.verdict] ||
            b.cell.hpLeft - a.cell.hpLeft,
        )
      const dmg =
        sem.pivot === 'u-turn' ? (base.myMoves.find((m) => m.moveId === id) ?? null) : null
      const best = landing[0]
      out.push({
        userKey: user.key,
        moveId: id,
        kind: sem.pivot,
        moveName: name,
        first: base.first,
        damage: dmg,
        landing,
        passes,
        why: best
          ? sem.pivot === 'u-turn'
            ? `${name} ${dmg ? `for ${dmg.percent.min.toFixed(0)}-${dmg.percent.max.toFixed(0)}%` : ''}, ${base.first.min >= 1 ? 'moving first: the switch-in takes the hit' : base.first.max <= 0 ? 'moving second: the switch-in comes in free' : 'speed decides who takes the hit'}`
            : `${passes ? 'Builds boosts and passes them' : 'Passes'} to the best recipient`
          : 'Nothing to bring in',
      })
    }
  }
  return out
}

/** Stats shown beside a pivot or setup line. */
export const BOOST_STATS = STAT_IDS.filter((s) => s !== 'hp')
