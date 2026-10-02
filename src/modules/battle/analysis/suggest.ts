/**
 * R5: IMPROVEMENT SUGGESTIONS -- concrete changes that turn a lost or uncertain
 * one-on-one into a win, each checked by re-running the cell with the change:
 *
 *   move   a move the Pokemon can learn in this game (level-up at or below its
 *          level, TM/HM, tutor) in place of its least useful move here;
 *   speed  the Speed investment (and nature) that outspeeds (V4's solver);
 *   bulk   the HP/defence investment that survives the hit that decides it (D5);
 *   level  the level at which it wins (R4), up to ten levels above.
 *
 * Nothing is applied: a suggestion is text plus the change, for the reader to try
 * in a Customize scenario (S7b).
 */

import { getMove, getType, resolveTypesForGeneration, type LearnRow } from '../../../data'
import { effectiveLevel, varietyOfSpec, type BattlerSpec } from '../battler'
import { gameMove } from '../battleData'
import { typeMult } from '../engine/turn'
import { noMods, speedThreshold } from '../speed'
import { matrixCell, type Matrix, type MatrixInput, type Verdict } from './matrix'
import { solveBulk } from './solver'

export interface Suggestion {
  kind: 'move' | 'speed' | 'bulk' | 'level'
  mineKey: string
  targetKey: string
  title: string
  detail: string
  /** Verdict before -> after, for the target. */
  from: Verdict
  to: Verdict
  /** How many cells of my row improve (move suggestions can fix several). */
  gain: number
  /** The change, for the "try it" button. */
  change: {
    replaceMoveId?: number
    withMoveId?: number
    speedEffort?: number
    natureIds?: number[]
    hp?: number
    def?: number
    level?: number
  }
}

const RANK: Record<Verdict, number> = { wins: 3, trades: 2, roll: 1, loses: 0 }

export interface SuggestInput extends MatrixInput {
  matrix: Matrix
  /** Learnset rows for my species in this version group (caller loads them). */
  learnsets: Map<number, LearnRow[]>
  /** Speed / bulk / level solvers can be slow; cap the cells examined. */
  maxCells?: number
}

function learnable(rows: LearnRow[] | undefined, b: BattlerSpec): number[] {
  if (!rows) return []
  const ok = new Set<number>()
  const v = varietyOfSpec(b)
  for (const r of rows) {
    if (r.pokemon_id !== v.pokemon_id && rows.some((x) => x.pokemon_id === v.pokemon_id)) continue
    if (r.method === 'level-up' && r.level > effectiveLevel(b)) continue
    if (r.method === 'egg' || r.method === 'light-ball-egg') continue
    ok.add(r.move_id)
  }
  return [...ok]
}

export function suggestions(inp: SuggestInput): Suggestion[] {
  const { ctx, data, matrix } = inp
  const out: Suggestion[] = []
  const gen = ctx.generation
  const typesOf = (b: BattlerSpec) =>
    resolveTypesForGeneration(varietyOfSpec(b), gen).map((t) => t.type_id)
  const stabTypes = (b: BattlerSpec) => typesOf(b).map((id) => getType(id)?.name ?? '')
  // ---- moves, aimed at the opponents nothing of mine answers (M4), then lost cells.
  const targets = new Set(matrix.unanswered)
  inp.theirs.forEach((t, j) => {
    if (inp.mine.every((_, i) => matrix.cells[i][j].verdict !== 'wins')) targets.add(t.key)
  })
  inp.mine.forEach((mine, i) => {
    const row = matrix.cells[i]
    const pool = learnable(inp.learnsets.get(mine.speciesId), mine).filter(
      (id) => !mine.moves.includes(id),
    )
    // The slot to give up: the move doing least across their whole team.
    const worth = mine.moves.map((id) =>
      row.reduce((s, c) => s + (c.myMoves.find((m) => m.moveId === id)?.expectedPct ?? 0), 0),
    )
    const dropIdx = worth.indexOf(Math.min(...worth))
    for (const tKey of targets) {
      const j = inp.theirs.findIndex((t) => t.key === tKey)
      const t = inp.theirs[j]
      const before = row[j]
      if (before.verdict === 'wins') continue
      const tTypes = typesOf(t)
      const stab = stabTypes(mine)
      const cands = pool
        .map((id) => ({ id, gm: gameMove(data, id) }))
        .filter(
          ({ gm }) =>
            gm &&
            gm.p > 1 &&
            (typeMult(gm.t, tTypes, gen) >= 2 ||
              (stab.includes(gm.t) && gm.p >= 75 && typeMult(gm.t, tTypes, gen) >= 1)),
        )
        .sort(
          (a, b) =>
            typeMult(b.gm!.t, tTypes, gen) * b.gm!.p - typeMult(a.gm!.t, tTypes, gen) * a.gm!.p,
        )
        .slice(0, 8)
      let best: Suggestion | null = null
      for (const { id } of cands) {
        const moves =
          mine.moves.length < 4
            ? [...mine.moves, id]
            : mine.moves.map((m, k) => (k === dropIdx ? id : m))
        const changed = { ...mine, moves }
        const after = matrixCell(inp, changed, t)
        if (RANK[after.verdict] <= RANK[before.verdict]) continue
        // Its effect on the whole row: cells better minus cells worse.
        const newRow = inp.theirs.map((x) => matrixCell(inp, changed, x))
        const gain = newRow.reduce(
          (s, c, k) => s + Math.sign(RANK[c.verdict] - RANK[row[k].verdict]),
          0,
        )
        if (gain <= 0) continue
        if (
          !best ||
          gain > best.gain ||
          (gain === best.gain && RANK[after.verdict] > RANK[best.to])
        ) {
          const dropName = mine.moves.length < 4 ? null : getMove(mine.moves[dropIdx])?.display_name
          best = {
            kind: 'move',
            mineKey: mine.key,
            targetKey: t.key,
            title: `${mine.label}: ${getMove(id)?.display_name ?? id}${dropName ? ` over ${dropName}` : ''}`,
            detail: `${before.verdict} -> ${after.verdict} against ${t.label}; ${gain} cell${gain === 1 ? '' : 's'} better in its row`,
            from: before.verdict,
            to: after.verdict,
            gain,
            change: {
              replaceMoveId: mine.moves.length < 4 ? undefined : mine.moves[dropIdx],
              withMoveId: id,
            },
          }
        }
      }
      if (best) out.push(best)
    }
  })
  // ---- speed, bulk and level, for cells that are close.
  let budget = inp.maxCells ?? 24
  inp.mine.forEach((mine, i) => {
    inp.theirs.forEach((t, j) => {
      const c = matrix.cells[i][j]
      if (c.verdict === 'wins' || budget <= 0) return
      const nMe = c.myBest?.hitsToKO.max ?? Infinity
      const nThem = c.theirBest?.hitsToKO.min ?? Infinity
      if (!Number.isFinite(nMe)) return
      budget--
      // Speed: a cell decided by who moves first.
      if (c.first.max < 1 && nMe <= nThem) {
        const th = speedThreshold(
          ctx,
          data,
          mine,
          noMods(inp.field.weather),
          t,
          noMods(inp.field.weather),
          inp.badges,
        )
        const eff = th.minEffort ?? th.minEffortPlusNature
        if (eff != null && !th.outspeedsNow) {
          const plus = th.minEffort == null
          out.push({
            kind: 'speed',
            mineKey: mine.key,
            targetKey: t.key,
            title: `${mine.label}: ${eff} Speed ${ctx.spreadModel === 'ev' ? 'EVs' : 'Stat Exp'}${plus ? ' with a +Speed nature' : ''}`,
            detail: `Outspeeds ${t.label} (${th.target}); moving first, it ${nMe <= nThem ? 'KOs before it is KOed' : 'still needs more damage'}`,
            from: c.verdict,
            to: 'wins',
            gain: 1,
            change: { speedEffort: eff },
          })
        } else if (
          th.minLevel != null &&
          th.minLevel <= effectiveLevel(mine) + 10 &&
          !th.outspeedsNow
        ) {
          out.push({
            kind: 'level',
            mineKey: mine.key,
            targetKey: t.key,
            title: `${mine.label}: level ${th.minLevel}`,
            detail: `Outspeeds ${t.label} from level ${th.minLevel}`,
            from: c.verdict,
            to: 'wins',
            gain: 1,
            change: { level: th.minLevel },
          })
        }
      }
      // Bulk: survive one more of its hits.
      if (
        c.theirBest &&
        nThem < Infinity &&
        nThem + 1 >= nMe &&
        (c.verdict === 'loses' || c.verdict === 'roll')
      ) {
        const b = solveBulk(inp, mine, t, c.theirBest.moveId, nThem)
        if (!b.survivesNow && b.mix && !b.exceedsCap) {
          const changed = {
            ...mine,
            spreadMode: 'custom' as const,
            spread: {
              ...mine.spread,
              effort: {
                ...mine.spread.effort,
                hp: { min: b.mix.hp, max: b.mix.hp },
                [b.defenseStat]: { min: b.mix.def, max: b.mix.def },
              },
            },
          }
          const after = matrixCell(inp, changed, t)
          if (RANK[after.verdict] > RANK[c.verdict])
            out.push({
              kind: 'bulk',
              mineKey: mine.key,
              targetKey: t.key,
              title: `${mine.label}: ${b.mix.hp} HP / ${b.mix.def} ${b.defenseStat.replace('-', ' ')}`,
              detail: `Survives ${nThem} of ${t.label}'s ${c.theirBest.name}; ${c.verdict} -> ${after.verdict}`,
              from: c.verdict,
              to: after.verdict,
              gain: 1,
              change: { hp: b.mix.hp, def: b.mix.def },
            })
        }
      }
      // Level (R4): the lowest level, up to +10, that wins outright.
      if (c.verdict !== 'trades') {
        for (
          let lv = effectiveLevel(mine) + 1;
          lv <= Math.min(100, effectiveLevel(mine) + 10);
          lv++
        ) {
          const after = matrixCell(inp, { ...mine, levelOverride: lv }, t)
          if (after.verdict === 'wins') {
            out.push({
              kind: 'level',
              mineKey: mine.key,
              targetKey: t.key,
              title: `${mine.label}: level ${lv}`,
              detail: `Beats ${t.label} one-on-one from level ${lv} (${after.why})`,
              from: c.verdict,
              to: 'wins',
              gain: 1,
              change: { level: lv },
            })
            break
          }
        }
      }
    })
  })
  // One per (kind, mine, target), the strongest first.
  const seen = new Set<string>()
  return out
    .sort((a, b) => b.gain - a.gain || RANK[b.to] - RANK[a.to])
    .filter((s) => {
      const k = `${s.kind}|${s.mineKey}|${s.targetKey}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}
