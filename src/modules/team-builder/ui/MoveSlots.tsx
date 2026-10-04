/**
 * The four move dropdowns.
 *
 * OPTIONS COME FROM `getLegalMoveset`, unmodified. This component does not filter,
 * sort by legality, or second-guess it -- if a move is in the list it is legal for
 * this species, stage, level and trade block, and that judgement lives in one
 * place.
 *
 * TYPES ARE ALREADY RESOLVED. `LegalMove.type` is a type NAME the moveset function
 * produced through src/data/moveEra.ts. Nothing here touches `type_id`, which is
 * the standing rule for this module: a Gen 1 Karate Chop is Normal and a Gen 2-4
 * Curse is ???-typed, and a raw read renders both wrong.
 *
 * THE CATEGORY IS THE ERA'S, through the damage calculator's `categoryFor`: before
 * Gen 4 it follows the TYPE (every Fire move is special); `damage_class` is the
 * Gen 4+ answer, and reading it directly showed a Gen 3 Crunch as physical.
 *
 * UNDER EACH MOVE, ABBREVIATIONS (owner's item 2): the type as three letters in
 * the type's text colour, the category as Phy / Spe / Sta, mono 11px. The
 * "Move N" label is the key -- hover or focus it and its tooltip spells both
 * out, with the move's power, PP, accuracy and effect.
 *
 * CLEARING A SLOT CLOSES THE GAP. Emptying slot 2 pulls 3 into 2 and 4 into 3 --
 * `clearMoveSlot` in model.ts does it, so the same rule applies wherever a slot is
 * cleared. An empty slot is always valid, never a validation error.
 *
 * NO SLOT OFFERS A MOVE ANOTHER SLOT ALREADY HAS. A moveset cannot contain the
 * same move twice in any generation, so a duplicate is not a choice the reader
 * could want -- it is a slip waiting to happen, and one that silently costs a
 * quarter of the build. This is a per-slot VIEW of the legal list, not a change
 * to it: `getLegalMoveset` still decides what is legal, and the filter below
 * only hides what is already spoken for elsewhere. See `available`.
 */

import { getMove } from '../../../data'
import { categoryFor } from '../../calculators/damage/moveResolve'
import { categoryLabel, moveInfoFor, moveRowFor } from '../buildFacts'
import { MOVE_SLOTS } from '../model'
import type { LegalMove } from '../legalMoveset'
import { LabelTip } from './LabelTip'

const TYPE_ABBR: Record<string, string> = {
  normal: 'NOR',
  fire: 'FIR',
  water: 'WAT',
  electric: 'ELE',
  grass: 'GRA',
  ice: 'ICE',
  fighting: 'FGT',
  poison: 'PSN',
  ground: 'GRD',
  flying: 'FLY',
  psychic: 'PSY',
  bug: 'BUG',
  rock: 'ROC',
  ghost: 'GHO',
  dragon: 'DRG',
  dark: 'DRK',
  steel: 'STL',
  fairy: 'FRY',
}

const CATEGORY_ABBR: Record<string, string> = {
  physical: 'Phy',
  special: 'Spe',
  status: 'Sta',
}

const KEY_TEXT =
  'Under the move: its type in three letters (WAT = Water, FGT = Fighting…) and its category — Phy = Physical, Spe = Special, Sta = Status.'

function typeTitle(type: string): string {
  return type === 'unknown' ? '???' : type.charAt(0).toUpperCase() + type.slice(1)
}

export function MoveSlots({
  moveIds,
  generation,
  options,
  loading,
  failed,
  onChange,
}: {
  moveIds: (number | null)[]
  generation: number
  options: LegalMove[]
  loading: boolean
  failed: string[]
  onChange: (slot: number, moveId: number | null) => void
}) {
  const byName = [...options].sort((a, b) => a.name.localeCompare(b.name))
  /* Everything picked anywhere on the build. Read once, not per slot. */
  const taken = new Set(moveIds.filter((id): id is number => id != null))

  return (
    <div className="tb-moves" data-layout="moves" data-testid="tb-move-slots">
      {Array.from({ length: MOVE_SLOTS }, (_, slot) => {
        const moveId = moveIds[slot] ?? null
        const chosen = options.find((m) => m.move_id === moveId) ?? null
        /* A move already on the build but absent from the current legal list (the
           level dropped, say) still renders, so an edit elsewhere cannot silently
           blank a slot. It is resolved through the same choke point. */
        const fallback = moveId != null && !chosen ? moveRowFor(moveId, generation) : null
        const type = chosen?.type ?? fallback?.type ?? null
        const record = moveId != null ? getMove(moveId) : null
        const category =
          record && type
            ? categoryFor(generation, record, type)
            : (chosen?.category ?? fallback?.category ?? null)

        /* Reads the SELECTED move, so the tip describes what is in the slot
           rather than whatever the dropdown is hovering. */
        const info = moveInfoFor(moveId, generation)
        const typeAbbr = type ? (TYPE_ABBR[type] ?? '???') : null
        const catAbbr = category ? (CATEGORY_ABBR[category] ?? null) : null
        const tip =
          info && type && typeAbbr && category && catAbbr
            ? [
                info.name,
                `${typeAbbr} = ${typeTitle(type)} · ${catAbbr} = ${categoryLabel(category)}`,
                `Power ${info.power ?? '—'} · PP ${info.pp ?? '—'} · Acc ${info.accuracy == null ? '—' : `${info.accuracy}%`}`,
                info.text,
              ]
                .filter(Boolean)
                .join('\n')
            : KEY_TEXT

        /*
          THIS SLOT'S OWN MOVE SURVIVES THE FILTER, which is the whole subtlety.
          Drop every taken move and the selected one goes with it, leaving a
          <select> whose value matches no option -- browsers then show the first
          option instead, so the slot would read as empty while the build still
          held the move. The identity check is what keeps it listed here and
          hidden from the other three.
        */
        const available = byName.filter((m) => m.move_id === moveId || !taken.has(m.move_id))

        return (
          <div className="tb-move-slot" key={slot} data-testid={`tb-move-slot-${slot}`}>
            <span className="tb-field-label">
              <LabelTip tip={tip} testId={`tb-move-info-${slot}`}>
                Move {slot + 1}
              </LabelTip>
            </span>
            <select
              className="tb-select"
              value={moveId ?? ''}
              disabled={loading && options.length === 0}
              data-testid={`tb-move-select-${slot}`}
              onChange={(e) =>
                onChange(slot, e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">—</option>
              {available.map((move) => (
                <option key={move.move_id} value={move.move_id}>
                  {move.name}
                  {/* The asterisk IS the event affordance. */}
                  {move.is_event ? ' *' : ''}
                </option>
              ))}
            </select>
            <span
              className="tb-move-meta"
              data-testid={`tb-move-meta-${slot}`}
              data-move-type={type ?? ''}
            >
              {typeAbbr && (
                <span className="tb-move-abbr" data-type={type ?? undefined}>
                  {typeAbbr}
                </span>
              )}
              {catAbbr && <span className="tb-move-cat">{catAbbr}</span>}
              {chosen?.is_event && <span className="tb-move-event">*</span>}
            </span>
          </div>
        )
      })}
      {failed.length > 0 && (
        <p className="tb-warn" data-testid="tb-moveset-failed">
          Some move data could not be loaded ({failed.join(', ')}), so this list may be incomplete.
        </p>
      )}
    </div>
  )
}
