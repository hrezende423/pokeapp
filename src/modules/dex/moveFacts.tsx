import { getItem, getType, moveFlags } from '../../data'
import type { Move } from '../../data'
import { moveForGeneration, PHYSICAL_SPECIAL_SPLIT_GENERATION } from '../../data/moveEra'

/**
 * The move fields the Movedex did not previously surface, derived once.
 *
 * The table gained two columns (the generation a move was introduced in, and its
 * range) and the detail page gained everything else the bundle carries about a
 * move -- priority, target, effect chance, the whole `meta` block, stat changes,
 * the Bulbapedia flag layer, the machines that teach it and its contest data.
 * All of it was already in `moves.json` and none of it was on screen.
 */

const DASH = '—'

export const titleCaseMove = (value: string | null | undefined) =>
  value ? value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : DASH

/**
 * What a move can be aimed at, in the words a player would use.
 *
 * PokeAPI's fourteen `target` slugs are a mix of who and where -- "users-field"
 * is a side of the field, "selected-pokemon" is one Pokemon you choose,
 * "specific-move" is another MOVE (Counter, Mirror Coat). They are mapped rather
 * than title-cased because "Users Field" is not English and "Specific Move" does
 * not say that the target is a move someone else used.
 *
 * Unmapped slugs fall back to the title-cased slug rather than to a dash: a new
 * target arriving from a data rebuild should read oddly, not disappear.
 */
const TARGET_LABELS: Record<string, string> = {
  user: 'Self',
  'user-and-allies': 'Self and allies',
  ally: 'Ally',
  'user-or-ally': 'Self or ally',
  'selected-pokemon': 'Selected target',
  'selected-pokemon-me-first': 'Selected target',
  'random-opponent': 'Random opponent',
  'all-opponents': 'All opponents',
  'all-other-pokemon': 'All others',
  'all-pokemon': 'All on field',
  'entire-field': 'Whole field',
  'users-field': 'Own side',
  'opponents-field': 'Opposing side',
  'specific-move': 'A specific move',
}

/**
 * The label for one target slug, exported so the Movedex's RANGE FILTER and its
 * Range COLUMN cannot disagree about what "Own side" means.
 *
 * The filter needs slug -> label without a move to read it off, which is the only
 * reason this is separate from `moveRange` rather than inlined in it.
 */
export function moveRangeLabel(target: string | null | undefined): string {
  if (target == null) return DASH
  return TARGET_LABELS[target] ?? titleCaseMove(target)
}

export function moveRange(move: Move): string {
  return moveRangeLabel(move.target)
}

/** Sorted by the label, so the column groups the ranges that read alike. */
export function moveRangeSort(move: Move): string | null {
  return move.target == null ? null : moveRange(move)
}

/**
 * The machines that teach this move, within Gen 1-4.
 *
 * `machines` is per version group and the same TM number recurs across games, so
 * the ITEM is what is distinct rather than the row -- TM26 in Ruby and TM26 in
 * Emerald are one answer, printed once.
 */
export function machineNames(move: Move, inScope: Set<string>): string[] {
  const names = new Set<string>()
  for (const machine of move.machines) {
    if (machine.version_group == null || !inScope.has(machine.version_group)) continue
    if (machine.item_id == null) continue
    const item = getItem(machine.item_id)
    if (item) names.add(item.display_name)
  }
  return [...names].sort()
}

/** The seven supplement flags this move carries, as display labels. */
export function moveFlagLabels(move: Move): string[] {
  return moveFlags(move.name).map((flag) => titleCaseMove(flag))
}

/**
 * The `meta` block as label/value pairs, with the rows that say nothing dropped.
 *
 * EVERY FIELD IN meta IS ZERO FOR MOST MOVES -- drain, healing, flinch chance,
 * crit rate and the rest are the exception rather than the rule -- so a fixed
 * table of thirteen rows would be twelve dashes and one fact on almost every
 * move. Only the rows with something to say are built, which is the same
 * decision EntityDetailPage makes about empty species sections.
 */
export function moveMetaRows(move: Move): { label: string; value: string }[] {
  const meta = move.meta
  if (!meta) return []
  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: string | number | null | undefined) => {
    if (value == null || value === 0 || value === '' || value === 'none') return
    rows.push({ label, value: String(value) })
  }
  push('Category', titleCaseMove(meta.category))
  // Title-cased AFTER the guard: `push` drops the literal 'none', and
  // titleCaseMove would have handed it 'None', which is not the same string.
  if (meta.ailment && meta.ailment !== 'none') push('Ailment', titleCaseMove(meta.ailment))
  push('Ailment chance', meta.ailment_chance ? `${meta.ailment_chance}%` : null)
  push('Stat chance', meta.stat_chance ? `${meta.stat_chance}%` : null)
  push('Crit rate', meta.crit_rate)
  push('Drain', meta.drain ? `${meta.drain}%` : null)
  push('Healing', meta.healing ? `${meta.healing}%` : null)
  push('Flinch chance', meta.flinch_chance ? `${meta.flinch_chance}%` : null)
  if (meta.min_hits != null && meta.max_hits != null) {
    rows.push({
      label: 'Hits',
      value:
        meta.min_hits === meta.max_hits ? `${meta.min_hits}` : `${meta.min_hits}–${meta.max_hits}`,
    })
  }
  if (meta.min_turns != null && meta.max_turns != null) {
    rows.push({
      label: 'Turns',
      value:
        meta.min_turns === meta.max_turns
          ? `${meta.min_turns}`
          : `${meta.min_turns}–${meta.max_turns}`,
    })
  }
  return rows
}

/** "+2 Attack, -1 Defense", in the move's own order. */
export function statChangeLabels(move: Move): string[] {
  return move.stat_changes
    .filter((c) => c.stat != null)
    .map((c) => `${c.change > 0 ? '+' : ''}${c.change} ${titleCaseMove(c.stat)}`)
}

/** One point on a move's history: the generation, and what it was or became. */
export interface MoveTimelineStep {
  generation: number
  /** The first step carries every value; later steps only what changed. */
  initial: boolean
  parts: { key: string; label: string }[]
}

const TIMELINE_FIELDS: {
  key: string
  read: (m: Move) => string | number | null
  show: (v: string | number | null) => string
}[] = [
  {
    key: 'type',
    read: (m) => (m.type_id == null ? null : (getType(m.type_id)?.name ?? null)),
    show: (v) => `Type ${v === 'unknown' ? '???' : titleCaseMove(v == null ? null : String(v))}`,
  },
  {
    key: 'category',
    read: (m) => m.damage_class,
    show: (v) => titleCaseMove(v == null ? null : String(v)),
  },
  { key: 'power', read: (m) => m.power, show: (v) => `BP ${v ?? DASH}` },
  { key: 'accuracy', read: (m) => m.accuracy, show: (v) => `Acc ${v == null ? DASH : `${v}%`}` },
  { key: 'pp', read: (m) => m.pp, show: (v) => `PP ${v ?? DASH}` },
  {
    key: 'effect_chance',
    read: (m) => m.effect_chance,
    show: (v) => `Effect ${v == null ? DASH : `${v}%`}`,
  },
]

/**
 * A move's history as a vertical timeline (owner, 2026-10-11): the values it was
 * introduced with, then one step per generation in which any of them changed,
 * naming only what changed -- "Gen 4 · PP 15" says the power was kept.
 *
 * DERIVED BY RESOLVING THE MOVE ONCE PER GENERATION through moveForGeneration,
 * the same resolver every other era-sensitive figure on the page uses, rather
 * than by reading `past_values` directly: a step can then never disagree with
 * what the page shows for that generation. It also catches the changes that
 * live in RULES rather than rows -- a damaging move's category follows its type
 * until Generation 4, so Fire Punch steps from Special to Physical there.
 *
 * Capped at `untilGeneration` -- the selected one -- because a step from a
 * generation the reader has not selected describes data the page is not
 * showing. Takes the RAW bundle move: an era-resolved copy would replay its own
 * generation's values as the starting point.
 *
 * THE SPLIT ALONE IS NOT A HISTORY (owner, 2026-10-11). Every damaging move
 * older than Generation 4 whose category differs from its type's gets a "Gen 4:
 * Physical" step from the rule above, and a timeline that says only that is
 * saying something true of ~100 moves rather than of this one. So when the only
 * change is the category at the split, the history is just the initial step and
 * the page draws no timeline. A category change in any OTHER generation -- the
 * case the owner named -- still counts, as does the split beside a real change.
 */
export function moveTimeline(raw: Move, untilGeneration: number): MoveTimelineStep[] {
  const from = raw.generation_id
  if (from == null || from > untilGeneration) return []
  const steps: MoveTimelineStep[] = []
  let previous: Move | null = null
  for (let gen = from; gen <= untilGeneration; gen += 1) {
    const now = moveForGeneration(raw, gen)
    const changed = TIMELINE_FIELDS.filter(
      (f) => previous == null || f.read(previous) !== f.read(now),
    )
      // The first step lists what the move HAS; a field it never had (a status
      // move's power) is absent rather than printed as a dash.
      .filter((f) => previous != null || f.read(now) != null)
    if (previous == null || changed.length > 0) {
      steps.push({
        generation: gen,
        initial: previous == null,
        parts: changed.map((f) => ({ key: f.key, label: f.show(f.read(now)) })),
      })
    }
    previous = now
  }
  const onlySplit = steps
    .slice(1)
    .every(
      (step) =>
        step.generation === PHYSICAL_SPECIAL_SPLIT_GENERATION &&
        step.parts.every((p) => p.key === 'category'),
    )
  return onlySplit ? steps.slice(0, 1) : steps
}
