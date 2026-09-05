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
 * CLEARING A SLOT CLOSES THE GAP. Emptying slot 2 pulls 3 into 2 and 4 into 3 --
 * `clearMoveSlot` in model.ts does it, so the same rule applies wherever a slot is
 * cleared. An empty slot is always valid, never a validation error.
 */

import { TypeLabel } from '../../../components/ds/TypeLabel'
import { categoryLabel, moveRowFor } from '../buildFacts'
import { MOVE_SLOTS } from '../model'
import type { LegalMove } from '../legalMoveset'

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
        const category = chosen?.category ?? fallback?.category ?? null

        return (
          <div className="tb-move-slot" key={slot} data-testid={`tb-move-slot-${slot}`}>
            <span className="tb-field-label">Move {slot + 1}</span>
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
              {byName.map((move) => (
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
              {type ? <TypeLabel type={type} small /> : <span className="tb-move-untyped" />}
              <span className="tb-move-cat">{categoryLabel(category)}</span>
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
