/**
 * Team Matchup's own state: what the reader set up (S1-S7), and the named
 * scenarios saved from it (S7e, R3, R7).
 *
 * A SETUP REFERS, IT DOES NOT COPY. My team is a Team Building team id and each
 * member a build id; the opponent is a trainer id (or a facility trainer, or a
 * custom team). What the matchup changes is held as OVERRIDES on top -- a
 * customised spread, a what-if level, an edited move -- so "Use current spread"
 * always reads the saved build as it is now, and nothing here ever writes to
 * Team Building (S7b).
 *
 * A SCENARIO is a named snapshot of a setup, plus link fields for the Notes,
 * Journal, Nuzlocke Tracker and Collection modules (R7). Those modules do not
 * exist yet: the fields are shaped for them and stay empty until they do.
 */

import type { SpreadMode, SpreadSpec } from '../battle/battler'
import { emptyMatchField, type MatchField } from '../battle/damage'
import { DEFAULT_FORMAT, type FormatRules } from '../battle/format'

/** What the matchup changes about one Pokemon, on top of its source. */
export interface MonOverride {
  /** Per-Pokemon override of the team's spread mode (S7). */
  spreadMode?: SpreadMode
  /** The customised copy (S7b), any value of which may be a range (S7c). */
  spread?: SpreadSpec
  /** R4 what-if level. */
  levelOverride?: number | null
  /** S5: an edited opponent (or a hypothetical of mine). */
  moves?: number[]
  itemId?: number | null
  abilityId?: number | null
}

export type OpponentRef =
  | { kind: 'trainer'; trainerId: string }
  | {
      kind: 'facility'
      facilityId: string
      trainerKey: string
      level: number
      group: number | null
      picks: string[]
    }
  | { kind: 'custom' }

/** S5: a Pokemon of a custom opponent team. */
export interface CustomMon {
  speciesId: number
  varietyName: string
  level: number
  moves: number[]
  itemId: number | null
  abilityId: number | null
  natureId: number | null
}

export interface MatchupSetup {
  teamId: string | null
  /** S7: the spread mode for all of mine, overridable per Pokemon. */
  mySpreadMode: SpreadMode
  /** Keyed by build id. */
  mine: Record<string, MonOverride>
  /** Leading Pokemon (index into my team). */
  lead: number
  /** S6: my second lead in a double battle (default: the next healthy Pokemon). */
  lead2?: number
  opponent: OpponentRef | null
  theirSpreadMode: SpreadMode
  /** Keyed by party slot. */
  theirs: Record<number, MonOverride>
  custom: CustomMon[]
  format: FormatRules
  field: MatchField
  /** Badges owned (badge boosts, Gen 1-3). */
  badges: string[]
  /** O4: rank leads and lines by not fainting rather than by winning. */
  nuzlocke: boolean
  /** The scenario last loaded or saved (S7f labels every output with it). */
  scenarioId: string | null
}

export interface ScenarioLinks {
  noteId: string | null
  journalEntryId: string | null
  nuzlockeRunId: string | null
  collectionId: string | null
}

export const EMPTY_LINKS: ScenarioLinks = {
  noteId: null,
  journalEntryId: null,
  nuzlockeRunId: null,
  collectionId: null,
}

export interface Scenario {
  id: string
  name: string
  versionGroup: string
  createdAt: string
  updatedAt: string
  setup: MatchupSetup
  notes: string
  links: ScenarioLinks
}

export interface MatchupDoc {
  /** The working setup per game (each game keeps its own). */
  setups: Record<string, MatchupSetup>
  scenarios: Scenario[]
  nextScenarioSeq: number
}

export function emptySetup(): MatchupSetup {
  return {
    teamId: null,
    mySpreadMode: 'current',
    mine: {},
    lead: 0,
    opponent: null,
    theirSpreadMode: 'current',
    theirs: {},
    custom: [],
    format: { ...DEFAULT_FORMAT },
    field: emptyMatchField(),
    badges: [],
    nuzlocke: false,
    scenarioId: null,
  }
}

export const EMPTY_DOC: MatchupDoc = { setups: {}, scenarios: [], nextScenarioSeq: 1 }
