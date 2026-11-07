/**
 * The Trainer Dex's rows: one per TRAINER and one per facility trainer, flattened
 * out of a game's partition (data/trainers.ts).
 *
 * ONE ROW PER TRAINER, NOT PER TEAM (owner, 2026-10-11). The data has a record
 * per team -- Youngster Joey is four, the rival's first battle three (one per
 * starter) -- and the list used to show each as its own row. A row now gathers
 * every team the same trainer fields at the same place: the rematches that point
 * at it (`rematch_of`), and the sibling records the walkthrough tells apart by a
 * variant ("If you chose Totodile", "Second rematch"). The detail page offers the
 * teams as a mini navbar. A NAMELESS trainer merges only when the data marks a
 * variant: five "Grunt"s on one floor are five people, not one with five teams.
 *
 * A dex row needs a numeric id (DexPageShell and the nav selection key on one),
 * so a story trainer uses its index in the game's own trainer table and a
 * facility trainer an offset past every story index. Both are stable across
 * rebuilds of the same pins.
 *
 * KIND is the reader's first question -- "is this someone I fight on the way
 * through, a rematch, a battle-facility opponent, or something the game never
 * uses?" -- so it is decided here once and filtered on, not re-derived by each
 * view.
 */

import { useCallback, useEffect, useState } from 'react'
import { useGameInGeneration } from '../version-group/gameInGeneration'
import {
  hasTrainerData,
  loadTrainers,
  peekTrainers,
  trainerLabel,
  type Facility,
  type FacilityTrainer,
  type Trainer,
  type TrainerPartition,
} from '../../data/trainers'

export type TrainerKind = 'story' | 'rematch' | 'facility' | 'unused'

export const TRAINER_KIND_LABEL: Record<TrainerKind, string> = {
  story: 'Story',
  rematch: 'Rematch',
  facility: 'Battle facility',
  unused: 'Unused',
}

/** One team a trainer fields, and the name the detail page's navbar gives it. */
export interface TrainerTeam {
  trainer: Trainer
  /** "Initial", "Rematch 1", "Chikorita", "Second rematch". */
  label: string
  /**
   * The prize for beating this team. A rematch's record carries none, so it is
   * DERIVED by the games' own rule -- the class's base payout times the level of
   * the team's last Pokemon (Gen 1-4) -- with the base read off the trainer's
   * first team, which the data does price. Null when that is not priced either.
   */
  prize: number | null
}

export interface TrainerEntry {
  id: number
  kind: TrainerKind
  className: string
  name: string | null
  /** "Youngster Tristan", "Rocket", "Tower Tycoon Palmer". */
  label: string
  location: string | null
  area: string | null
  /** "If the player chose Turtwig", "Rematch 2": what tells identical names apart. */
  variant: string | null
  /** Walkthrough position; facility and unplaced rows sort after every placed one. */
  order: number
  prize: number | null
  levels: [number, number] | null
  trainer?: Trainer
  /** Every team of this trainer, initial first. Story and unused rows only. */
  teams?: TrainerTeam[]
  facility?: Facility
  facilityTrainer?: FacilityTrainer
}

const FACILITY_ID_BASE = 1_000_000

const lastLevel = (t: Trainer) => t.party[t.party.length - 1]?.level ?? null

const levelRange = (t: Trainer): [number, number] | null =>
  t.party.length
    ? [Math.min(...t.party.map((m) => m.level)), Math.max(...t.party.map((m) => m.level))]
    : null

/** "If you chose Totodile" -> "Totodile"; null for any other variant. */
const starterOf = (t: Trainer) =>
  t.appearances[0]?.variant?.match(/^If (?:the player|you) chose (.+)$/i)?.[1] ?? null

/**
 * A team the data MARKS as a first fight: a starter variant, or "Initial
 * battle". An unmarked sibling is not assumed to be one -- Emerald leaves some
 * rematches unlabelled -- so unmarked teams simply order by index, and the
 * lowest is the initial fight.
 */
const isFirstFight = (t: Trainer) =>
  !t.rematch_of && (starterOf(t) != null || /^initial/i.test(t.appearances[0]?.variant ?? ''))

/**
 * Every story/unused trainer gathered into one entry per person -- see the note
 * at the top. Ids are the first team's index, so a selection survives a rebuild.
 */
function groupTrainers(p: TrainerPartition): Trainer[][] {
  const byId = new Map(p.trainers.map((t) => [t.id, t]))
  const groups: Trainer[][] = []
  const groupOf = new Map<string, Trainer[]>()
  const key = (t: Trainer) => {
    const a = t.appearances[0]
    if (t.name == null && !a?.variant) return null
    return [t.class_id, t.name, a?.location, a?.area, t.unused ? 'u' : ''].join('|')
  }
  const roots = p.trainers.filter((t) => !t.rematch_of || !byId.has(t.rematch_of))
  for (const t of roots) {
    const k = key(t)
    const existing = k != null ? groupOf.get(k) : undefined
    if (existing) existing.push(t)
    else {
      const g = [t]
      groups.push(g)
      if (k != null) groupOf.set(k, g)
    }
  }
  const rootGroup = new Map<string, Trainer[]>()
  for (const g of groups) for (const t of g) rootGroup.set(t.id, g)
  for (const t of p.trainers) {
    if (t.rematch_of && byId.has(t.rematch_of)) rootGroup.get(t.rematch_of)?.push(t)
  }
  // First fights (one per starter, or the one), then every rematch, each by index.
  for (const g of groups) {
    g.sort((a, b) => Number(!isFirstFight(a)) - Number(!isFirstFight(b)) || a.index - b.index)
  }
  return groups
}

function teamsOf(group: Trainer[]): TrainerTeam[] {
  const base = group[0]
  const baseLast = lastLevel(base)
  const rate = base.prize != null && baseLast ? base.prize / baseLast : null
  /*
    ONE NUMBERING FOR REMATCHES, whatever the data calls them: Gen 2/4 link them
    with `rematch_of`, Emerald labels siblings "Second rematch", leaves some
    unlabelled, and mixes both. A starter variant keeps its starter's name; the
    data's "... onwards" (the last team repeats forever) survives as a "+".
  */
  let rematch = 0
  return group.map((t, i) => {
    const starter = starterOf(t)
    let label: string
    if (starter && !t.rematch_of) label = starter
    else if (i === 0 || isFirstFight(t)) label = 'Initial'
    else {
      rematch += 1
      label = `Rematch ${rematch}${/onwards/i.test(t.appearances[0]?.variant ?? '') ? '+' : ''}`
    }
    const last = lastLevel(t)
    const prize = t.prize ?? (rate != null && last ? Math.round(rate * last) : null)
    return { trainer: t, label, prize }
  })
}

export function trainerEntries(p: TrainerPartition): TrainerEntry[] {
  const out: TrainerEntry[] = []
  for (const group of groupTrainers(p)) {
    const t = group[0]
    const className = p.classes[t.class_id]?.name ?? t.class_id
    const first = t.appearances[0]
    const teams = teamsOf(group)
    out.push({
      id: t.index,
      kind: t.unused ? 'unused' : t.rematch_of ? 'rematch' : 'story',
      className,
      name: t.name,
      label: trainerLabel(className, t.name),
      location: first?.location ?? null,
      area: first?.area ?? null,
      // A row of several teams says how many rather than naming the first.
      variant: teams.length > 1 ? teamSummary(teams) : (first?.variant ?? null),
      order: Math.min(...group.map((x) => x.appearances[0]?.order ?? Number.MAX_SAFE_INTEGER - 1)),
      prize: teams[0].prize,
      levels: levelRange(t),
      trainer: t,
      teams,
    })
  }
  let n = 0
  for (const f of p.facilities) {
    for (const ft of f.trainers) {
      n += 1
      const className = ft.class_name ?? ''
      out.push({
        id: FACILITY_ID_BASE + n,
        kind: 'facility',
        className,
        name: ft.name,
        label: [className, ft.name].filter(Boolean).join(' '),
        location: f.name,
        area: ft.group ?? null,
        variant: null,
        order: Number.MAX_SAFE_INTEGER,
        prize: null,
        levels: null,
        facility: f,
        facilityTrainer: ft,
      })
    }
  }
  return out
}

/** "3 rematches", "3 teams · 2 rematches": the list's Note for a many-team row. */
function teamSummary(teams: TrainerTeam[]): string {
  const rematches = teams.filter((x) => x.label.startsWith('Rematch')).length
  const others = teams.length - rematches
  const parts: string[] = []
  if (others > 1) parts.push(`${others} starter teams`)
  if (rematches > 0) parts.push(`${rematches} ${rematches === 1 ? 'rematch' : 'rematches'}`)
  return parts.join(' · ')
}

export type TrainerLoad =
  | { status: 'idle' }
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; partition: TrainerPartition }
  | { status: 'error'; message: string }

/**
 * A game's trainer partition, loading on first ask. `unavailable` is a game with
 * no data (Colosseum, XD, the Japanese Red/Green/Blue) and is not an error; the
 * same readiness-by-key derivation as usePartitionRows.
 */
export function useTrainerPartition(versionGroup: string | null): {
  state: TrainerLoad
  retry: () => void
} {
  const [result, setResult] = useState<{ key: string; partition: TrainerPartition } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const available = hasTrainerData(versionGroup)
  const key = `${versionGroup ?? 'none'}|${attempt}`

  useEffect(() => {
    if (!versionGroup || !available) return
    let cancelled = false
    loadTrainers(versionGroup)
      .then((partition) => {
        if (!cancelled) setResult({ key, partition })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [versionGroup, available, key])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  let state: TrainerLoad
  if (!versionGroup) state = { status: 'idle' }
  else if (!available) state = { status: 'unavailable' }
  else if (failure?.key === key) state = { status: 'error', message: failure.message }
  else if (result?.key === key) state = { status: 'ready', partition: result.partition }
  else {
    // Already in memory from another screen: ready on the first render.
    const cached = peekTrainers(versionGroup)
    state = cached ? { status: 'ready', partition: cached } : { status: 'loading' }
  }
  return { state, retry }
}

/**
 * The Trainer Dex's game inside the app's generation (its game row), shared with
 * DexQueryProvider so the page and its filters always read the same game.
 */
export const useTrainerdexGame = () => useGameInGeneration('trainerdex', hasTrainerData)
