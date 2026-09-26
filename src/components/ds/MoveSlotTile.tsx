import type { ReactNode } from 'react'

/**
 * Move-slot tile (DESIGN-SYSTEM.md §5): a small bordered card, label above value,
 * arranged four to a 2x2 grid -- the species grid card's language at a smaller
 * scale.
 *
 * OPTIONALLY SELECTABLE. The damage calculator shows every slot's result and
 * opens one of them in full, so a tile can be the chosen one: it steps up to
 * `--surface-raised` with a `--text-secondary` border -- elevation as a tone-step,
 * no accent (the accent's four uses do not include "selected card") and no fill
 * colour. The label line is the selecting button; the control inside the tile
 * (a move picker) stays its own control, and focusing it selects the tile too.
 */
export function MoveSlotTile({
  label,
  children,
  detail,
  selected,
  onSelect,
  testId,
}: {
  label: string
  /** The value: a move picker, or the move's name when read-only. */
  children: ReactNode
  /** A secondary line under the value (a damage range, a type and power). */
  detail?: ReactNode
  selected?: boolean
  onSelect?: () => void
  testId?: string
}) {
  return (
    <div
      className="ds-move-slot"
      data-ds="move-slot-tile"
      data-selected={selected ? 'true' : undefined}
      data-testid={testId}
      onFocusCapture={onSelect}
    >
      {onSelect ? (
        <button
          type="button"
          className="ds-move-slot-label"
          aria-pressed={!!selected}
          onClick={onSelect}
        >
          {label}
        </button>
      ) : (
        <span className="ds-move-slot-label">{label}</span>
      )}
      <div className="ds-move-slot-value">{children}</div>
      {detail != null && <div className="ds-move-slot-detail">{detail}</div>}
    </div>
  )
}

/** The 2x2 arrangement. */
export function MoveSlotGrid({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="ds-move-slot-grid" data-testid={testId}>
      {children}
    </div>
  )
}
