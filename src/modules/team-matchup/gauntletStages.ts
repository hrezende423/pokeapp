/** R1's default run of fights, and a trainer turned into a gauntlet stage. */

import type { Trainer, TrainerPartition } from '../../data/trainers'
import type { GauntletStage } from '../battle/analysis/gauntlet'
import { applyFormat } from '../battle/format'
import type { GameContext } from '../battle/game'
import { trainerInfo, trainerTitle, trainerToSpecs } from '../battle/sources'

/** The Elite Four and the Champion, first fights only, in play order. */
export function defaultGauntlet(p: TrainerPartition): Trainer[] {
  const isLeague = (t: Trainer) => /elite|champion/i.test(p.classes[t.class_id]?.name ?? t.class_id)
  const isChampion = (t: Trainer) =>
    /champion/i.test(p.classes[t.class_id]?.name ?? t.class_id) || /RIVAL3/.test(t.class_id)
  const seen = new Set<string>()
  const out: Trainer[] = []
  const league = p.trainers
    .filter(
      (t) =>
        (isLeague(t) || /^RIVAL3/.test(t.id)) &&
        !t.rematch_of &&
        !t.unused &&
        t.appearances[0]?.order != null,
    )
    .sort((a, b) => a.appearances[0].order! - b.appearances[0].order!)
  for (const t of league) {
    const k = `${t.class_id}|${t.name}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (isChampion(t)) break
  }
  return out
}

export function stageOf(
  p: TrainerPartition,
  t: Trainer,
  ctx: GameContext,
  level50: boolean,
): GauntletStage {
  const specs = trainerToSpecs(t, ctx)
  return {
    key: t.id,
    label: trainerTitle(p, t),
    trainer: trainerInfo(t, ctx.versionGroup),
    // S6: the trainer's own double (or tag) battle is fought two-on-two in Gen 3-4.
    doubles: t.battle !== 'single' && ctx.generation >= 3,
    theirs: level50
      ? applyFormat([], specs, { level: 'level-50', itemClause: false, battle: 'single' }).theirs
      : specs,
  }
}
