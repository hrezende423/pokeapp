import { getItem, getType, moveFlags } from '../../data'
import type { Move } from '../../data'

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

/**
 * Values this move had in an EARLIER game than the one selected.
 *
 * `past_values` is kept verbatim from PokeAPI and nothing resolves it -- which is
 * a known open bug for the TYPE field specifically (three moves are stored as
 * Fairy with a Normal past value). This is not a fix for that: it SHOWS the
 * rows, labelled by the version group they belonged to, so the page stops
 * hiding the fact that a move's numbers changed. Resolving them into the
 * displayed figures is a separate decision that touches every learnset table.
 */
export function pastValueRows(
  move: Move,
  inScope: Set<string>,
): { label: string; value: string }[] {
  /*
    SCOPED TO THE GAMES THIS APP COVERS. `past_values` runs to Generation 9, and
    a row labelled "X Y" on a Gen 1-4 page describes an era the reader cannot
    select and is not being shown -- it reads as a correction to the figures
    above it rather than as a later change. Out-of-scope rows are dropped, and
    when none is left the block does not render at all.
  */
  return move.past_values
    .filter((past) => past.version_group != null && inScope.has(past.version_group))
    .map((past) => {
      const parts: string[] = []
      if (past.power != null) parts.push(`Power ${past.power}`)
      if (past.pp != null) parts.push(`PP ${past.pp}`)
      if (past.accuracy != null) parts.push(`Accuracy ${past.accuracy}%`)
      if (past.effect_chance != null) parts.push(`Effect ${past.effect_chance}%`)
      if (past.type_id != null) parts.push(`Type ${titleCaseMove(getType(past.type_id)?.name)}`)
      return {
        label: titleCaseMove(past.version_group),
        value: parts.length > 0 ? parts.join(' · ') : DASH,
      }
    })
}
