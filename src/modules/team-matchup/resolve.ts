/**
 * From the reader's setup to the engine's BattlerSpecs: my team from Team
 * Building (S1), the opponent from the Trainer Dex (S2/S3), a facility pool (R6)
 * or a custom team (S5), each with the matchup's overrides on top (S7), then the
 * format rules (S6).
 */

import { getSpecies, resolveAbilitiesForGeneration } from '../../data'
import type { TrainerPartition } from '../../data/trainers'
import {
  exactSpread,
  maximizeEffort,
  spreadKeys,
  type BattlerSpec,
  type SpreadMode,
} from '../battle/battler'
import { applyFormat } from '../battle/format'
import type { GameContext } from '../battle/game'
import { point } from '../battle/range'
import type { TrainerInfo } from '../battle/session'
import {
  buildToSpec,
  facilityPool,
  facilityTrainerInfo,
  trainerInfo,
  trainerTitle,
  trainerToSpecs,
  type PoolEntry,
} from '../battle/sources'
import type { Team, TeamBuilderData } from '../team-builder/model'
import type { CustomMon, MatchupSetup, MonOverride } from './model'

export interface Resolved {
  team: Team | null
  mine: BattlerSpec[]
  /** Build id per entry of `mine` (overrides are keyed by it). */
  mineBuildIds: string[]
  theirs: BattlerSpec[]
  trainer: TrainerInfo | null
  opponentTitle: string
  battle: 'single' | 'double' | 'tag'
  /** R6: a facility trainer's whole pool, each set with its chance of appearing. */
  pool: PoolEntry[] | null
  /** How many the facility draws from its pool per battle. */
  poolSize: number
  notes: string[]
  limitations: string[]
  problems: string[]
}

export function applyOverride(
  spec: BattlerSpec,
  ov: MonOverride | undefined,
  teamMode: SpreadMode,
  scenarioId: string | null,
): BattlerSpec {
  const mode = ov?.spreadMode ?? teamMode
  let s: BattlerSpec = { ...spec, scenarioId }
  if (mode === 'custom') s = { ...s, spreadMode: 'custom', spread: ov?.spread ?? spec.spread }
  if (ov?.levelOverride != null) s = { ...s, levelOverride: ov.levelOverride }
  const edited = ov?.moves != null || ov?.itemId !== undefined || ov?.abilityId !== undefined
  if (ov?.moves) s = { ...s, moves: ov.moves }
  if (ov?.itemId !== undefined) s = { ...s, itemId: ov.itemId }
  if (ov?.abilityId !== undefined) s = { ...s, abilityId: ov.abilityId }
  if (edited) s = { ...s, label: `${spec.label} (edited)` }
  return s
}

function customSpec(c: CustomMon, ctx: GameContext, i: number): BattlerSpec {
  const gen = ctx.generation
  const keys = spreadKeys(gen)
  const species = getSpecies(c.speciesId)
  const variety = species?.varieties.find((v) => v.name === c.varietyName) ?? species?.varieties[0]
  const ability =
    c.abilityId ??
    (variety && gen >= 3
      ? (resolveAbilitiesForGeneration(variety, gen)[0]?.ability.id ?? null)
      : null)
  return {
    key: `theirs:custom:${i}`,
    side: 'theirs',
    source: 'custom',
    label: species?.display_name ?? `#${c.speciesId}`,
    speciesId: c.speciesId,
    varietyName: variety?.name ?? '',
    level: c.level,
    spreadMode: 'current',
    scenarioId: null,
    spread: {
      individual: Object.fromEntries(keys.individual.map((k) => [k, point(ctx.maxIndividual)])),
      effort: Object.fromEntries(keys.effort.map((k) => [k, point(0)])),
      natureIds: gen >= 3 && c.natureId != null ? [c.natureId] : [],
      ceiling: false,
    },
    moves: c.moves.filter((m) => m > 0).slice(0, 4),
    itemId: gen >= 2 ? c.itemId : null,
    abilityId: gen >= 3 ? ability : null,
    gender: 'N',
  }
}

export function resolveSetup(
  ctx: GameContext,
  setup: MatchupSetup,
  tb: TeamBuilderData,
  partition: TrainerPartition | null,
): Resolved {
  const problems: string[] = []
  const limitations: string[] = []
  // ---- mine (S1)
  const team = setup.teamId ? (tb.teams.find((t) => t.id === setup.teamId) ?? null) : null
  const mine: BattlerSpec[] = []
  const mineBuildIds: string[] = []
  if (team) {
    team.memberIds.forEach((id, slot) => {
      if (!id) return
      const b = tb.builds.find((x) => x.id === id)
      if (!b) return
      if (b.generation !== ctx.generation) {
        problems.push(
          `${b.nickname || getSpecies(b.speciesId)?.display_name} is a Gen ${b.generation} build and is left out of this Gen ${ctx.generation} matchup`,
        )
        return
      }
      mine.push(
        applyOverride(
          buildToSpec(b, ctx, slot),
          setup.mine[b.id],
          setup.mySpreadMode,
          setup.scenarioId,
        ),
      )
      mineBuildIds.push(b.id)
    })
  }
  // ---- theirs (S2/S3, S5, R6)
  let theirs: BattlerSpec[] = []
  let trainer: TrainerInfo | null = null
  let opponentTitle = 'No opponent'
  let battle: Resolved['battle'] = 'single'
  let pool: PoolEntry[] | null = null
  let poolSize = 0
  const opp = setup.opponent
  if (opp?.kind === 'trainer' && partition) {
    const t = partition.trainers.find((x) => x.id === opp.trainerId)
    if (t) {
      theirs = trainerToSpecs(t, ctx)
      trainer = trainerInfo(t, ctx.versionGroup)
      opponentTitle = trainerTitle(partition, t)
      battle = t.battle
    } else problems.push('The saved opponent is not in this game')
  } else if (opp?.kind === 'facility' && partition) {
    const f = partition.facilities.find((x) => x.id === opp.facilityId)
    const ft = f?.trainers.find((x) => x.key === opp.trainerKey)
    if (f && ft) {
      const entries = facilityPool(f, opp.trainerKey, ctx, opp.level, opp.group ?? undefined)
      const ai = facilityTrainerInfo(f, opp.trainerKey, ctx)
      trainer = ai.info
      if (ai.lowConfidence) limitations.push(ai.lowConfidence)
      opponentTitle = `${f.name}: ${[ft.class_name, ft.name].filter(Boolean).join(' ')}`
      if (ft.party) {
        theirs = entries.map((e) => e.spec)
      } else {
        pool = entries
        poolSize = Math.min(3, entries.length)
        const picked = opp.picks
          .map((k) => entries.find((e) => e.setKey === k))
          .filter((e): e is PoolEntry => !!e)
        theirs = picked.length ? picked.map((e) => e.spec) : entries.map((e) => e.spec)
        if (!picked.length)
          limitations.push(
            `Facility pool: every set the trainer can draw (${entries.length}); each appears with chance ${((entries[0]?.p ?? 0) * 100).toFixed(1)}%`,
          )
      }
    } else problems.push('The saved facility trainer is not in this game')
  } else if (opp?.kind === 'custom') {
    theirs = setup.custom.map((c, i) => customSpec(c, ctx, i))
    opponentTitle = 'Custom team'
    // A custom team has no AI of its own: it plays as the game's generic trainer AI.
    trainer = {
      classId: '',
      aiFlags: ctx.generation === 3 ? ['check_bad_move'] : ctx.generation === 4 ? ['basic'] : [],
      versionGroup: ctx.versionGroup,
      bag: [],
    }
    limitations.push("Custom team: plays with the game's most basic trainer AI")
  }
  theirs = theirs.map((s, i) =>
    applyOverride(s, setup.theirs[i], setup.theirSpreadMode, setup.scenarioId),
  )
  // ---- format (S6)
  const f = applyFormat(mine, theirs, {
    ...setup.format,
    battle: battle === 'single' ? setup.format.battle : 'double',
  })
  if (f.limitation) limitations.push(f.limitation)
  return {
    team,
    mine: f.mine,
    mineBuildIds,
    theirs: f.theirs,
    trainer,
    opponentTitle,
    battle,
    pool,
    poolSize,
    notes: f.notes,
    limitations,
    problems,
  }
}

/** S7b: the editable copy a "Customize" starts from -- the spread as it is. */
export function customiseFrom(spec: BattlerSpec) {
  return { ...spec.spread }
}

/** S7d preset applied to a spec's spread. */
export function maximized(spec: BattlerSpec, ctx: GameContext) {
  return maximizeEffort(spec.spread, ctx)
}

/** S7a: the saved spread of a build, read-only (for "reset to current"). */
export { exactSpread }
