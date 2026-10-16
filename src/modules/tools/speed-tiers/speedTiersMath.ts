/**
 * #5 Speed tiers: who moves first, for any set of Pokemon typed in by hand or
 * loaded from a Team Builder team.
 *
 * PURE, AND UI-FREE. The mechanics are the battle engine's, not a second copy:
 * `effectiveSpeed` / `speedLadder` in battle/speed.ts already follow each game's
 * own turn-order routine (pokered core.asm, pokecrystal DetermineMoveOrder,
 * pokeemerald GetWhoStrikesFirst, pokeplatinum BattleSystem_CompareBattlerSpeed).
 * This file turns the tool's rows into the engine's battlers and checks them.
 *
 * ONLY SPEED IS ASKED FOR. Every other stat of a typed-in row is irrelevant to
 * turn order, so a row holds its Speed DV/IV and Stat Exp/EV and nothing else of
 * the spread. A row loaded from a build keeps its whole build.
 */

import { getSpecies, listNatures } from '../../../data'
import type { BattleData } from '../../battle/battleData'
import { exactSpread, type BattlerSpec } from '../../battle/battler'
import type { GameContext } from '../../battle/game'
import { speedLadder, type LadderRow, type SpeedMods } from '../../battle/speed'
import type { Weather } from '../../calculators/damage'

export type Side = 'mine' | 'theirs'

/** A nature's effect on Speed: the only part of a nature turn order reads. */
export type SpeedNature = 'up' | 'neutral' | 'down'

export interface TierRow {
  /** Stable within the page. */
  key: string
  side: Side
  speciesId: number | null
  /** Raw field text: validated by readTiers, never trusted. */
  level: string
  speedIndividual: string
  speedEffort: string
  nature: SpeedNature
  itemId: number | null
  abilityId: number | null
  /** PokeAPI move ids, for the priority exceptions (a loaded build's moves). */
  moves: number[]
  stage: number
  paralyzed: boolean
  /** Any non-volatile status (Quick Feet). */
  statused: boolean
  unburden: boolean
  slowStart: boolean
  /** Set on rows loaded from a build: the whole saved spread, used as is. */
  build?: BattlerSpec
}

export interface TierField {
  weather: Weather | null
  tailwind: Record<Side, boolean>
  trickRoom: boolean
}

export type TiersOutcome = { ok: true; rows: LadderRow[] } | { ok: false; reason: string }

/** A representative nature per Speed effect (Gen 3-4): Timid, Hardy, Brave. */
export function natureIdFor(effect: SpeedNature): number | null {
  const natures = listNatures()
  const pick =
    effect === 'neutral'
      ? // Neutral natures raise and lower the same stat (or none, depending on the source).
        natures.find((n) => n.increased_stat === n.decreased_stat)
      : natures.find((n) =>
          effect === 'up' ? n.increased_stat === 'speed' : n.decreased_stat === 'speed',
        )
  return pick?.id ?? null
}

function wholeIn(text: string, lo: number, hi: number): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

/** Rows -> the engine's ladder, or the first reason a row cannot be read. */
export function readTiers(
  ctx: GameContext,
  data: BattleData,
  rows: TierRow[],
  field: TierField,
): TiersOutcome {
  if (rows.length < 2) return { ok: false, reason: 'Add at least two Pokémon to compare.' }
  const gen = ctx.generation
  const word = gen <= 2 ? { iv: 'DV', ev: 'Stat Exp' } : { iv: 'IV', ev: 'EV' }
  const entries: { spec: BattlerSpec; mods: SpeedMods }[] = []
  for (const [i, row] of rows.entries()) {
    const n = i + 1
    const mods: SpeedMods = {
      stage: row.stage,
      paralyzed: row.paralyzed,
      statused: row.statused || row.paralyzed,
      weather: field.weather,
      tailwind: ctx.tailwind && field.tailwind[row.side],
      unburden: row.unburden,
      slowStart: row.slowStart,
    }
    if (row.build) {
      entries.push({ spec: { ...row.build, key: row.key, side: row.side }, mods })
      continue
    }
    const species = row.speciesId != null ? getSpecies(row.speciesId) : undefined
    if (!species) return { ok: false, reason: `Pick a Pokémon for row ${n}.` }
    const level = wholeIn(row.level, 1, 100)
    if (level == null) return { ok: false, reason: `Row ${n}: level must be a whole number from 1 to 100.` }
    const iv = wholeIn(row.speedIndividual, 0, ctx.maxIndividual)
    if (iv == null) {
      return { ok: false, reason: `Row ${n}: Speed ${word.iv} must be a whole number from 0 to ${ctx.maxIndividual}.` }
    }
    const ev = wholeIn(row.speedEffort, 0, ctx.maxEffort)
    if (ev == null) {
      return { ok: false, reason: `Row ${n}: Speed ${word.ev} must be a whole number from 0 to ${ctx.maxEffort}.` }
    }
    const variety = species.varieties.find((v) => v.is_default) ?? species.varieties[0]
    entries.push({
      spec: {
        key: row.key,
        side: row.side,
        source: 'custom',
        label: species.display_name,
        speciesId: species.id,
        varietyName: variety.name,
        level,
        spreadMode: 'current',
        scenarioId: null,
        spread: exactSpread(gen, { speed: iv }, { speed: ev }, gen >= 3 ? natureIdFor(row.nature) : null),
        moves: row.moves,
        itemId: ctx.hasItems ? row.itemId : null,
        abilityId: ctx.hasAbilities ? row.abilityId : null,
        gender: 'N',
      },
      mods,
    })
  }
  return { ok: true, rows: speedLadder(ctx, data, entries, new Set(), field.trickRoom) }
}
