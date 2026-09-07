/**
 * The two pieces of chrome bulk selection needs: the per-item check circle and
 * the bar that says what is selected. The state behind them is in
 * ./useBulkSelect, which is a separate file so this one exports only components.
 */

import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react'

/** The check circle itself. Filled when selected, hollow when not. */
export function SelectCircle({
  selected,
  onPointerDown,
  onPointerEnter,
  testId,
  label,
}: {
  selected: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerEnter: () => void
  testId?: string
  label: string
}) {
  return (
    <button
      type="button"
      className="tb-select-circle"
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      data-selected={selected ? 'true' : 'false'}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      /* The pointer handlers do the work. This is here so the control is
         reachable and operable from the keyboard, where there is no sweep. */
      onClick={(e) => e.preventDefault()}
    >
      {selected ? <IconCircleCheckFilled size={20} /> : <IconCircle size={20} stroke={1.5} />}
    </button>
  )
}

/**
 * The bar that appears with selection mode: what is selected, and the two ways
 * out. Delete is the only bulk action, per the spec.
 */
export function BulkBar({
  count,
  noun,
  onCancel,
  onDelete,
  testId,
}: {
  count: number
  /** Singular; pluralised with a bare "s". */
  noun: string
  onCancel: () => void
  onDelete: () => void
  testId?: string
}) {
  return (
    <div className="tb-bulk-bar" data-testid={testId}>
      <span className="tb-bulk-count num" data-testid={testId ? `${testId}-count` : undefined}>
        {count} {noun}
        {count === 1 ? '' : 's'} selected
      </span>
      <button
        type="button"
        className="tb-ghost tb-ghost-sm"
        data-testid={testId ? `${testId}-cancel` : undefined}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="tb-ghost tb-ghost-sm"
        data-danger="true"
        disabled={count === 0}
        data-testid={testId ? `${testId}-delete` : undefined}
        onClick={onDelete}
      >
        Delete selected
      </button>
    </div>
  )
}
