import type { ReactNode } from 'react'

/**
 * The data-display row family: the read-only stat row, the editable EV row and
 * its running total, and the move-slot tile.
 *
 * STAT ROW: label left (uppercase, secondary, label size), value right (numeric
 * font, bold), hairline divider. No bars and no colour-coding by value tier --
 * horizontal progress bars were tried and rejected as a generic
 * fitness-app/RPG-clone default (§4), so the plain table is the design.
 *
 * EV ROW: the same visual shape with an editable numeric value, and a running
 * total against the 510 cap as plain secondary text below the list, never a bar.
 * OPEN ITEM, carried from §5: sliders were requested for EV/IV entry and have not
 * been designed. This plain-number version is explicitly a placeholder for that,
 * not the final answer.
 *
 * MOVE-SLOT TILE: a small bordered tile, used to arrange the four fixed move
 * slots as a 2x2 grid rather than a linear list -- a deliberate echo of the grid
 * card at smaller scale. Radius is --radius-control, which design-tokens.json
 * assigns to "buttons, small tiles (e.g. move-slot cards)"; the demo HTML's 12px
 * is that file's compact rendering.
 */

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ds-stat-row" data-ds="stat-row">
      <span className="ds-stat-label">{label}</span>
      <span className="ds-stat-value">{value}</span>
    </div>
  )
}

export function StatList({ children }: { children: ReactNode }) {
  return (
    <div className="ds-stat-list" data-ds="stat-list">
      {children}
    </div>
  )
}

export function EvRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <label className="ds-stat-row" data-ds="ev-row">
      <span className="ds-stat-label">{label}</span>
      <input
        className="ds-ev-input"
        data-ds="ev-input"
        type="number"
        min={0}
        max={252}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

/** Plain text, never a bar. Turns accent-red only when the cap is exceeded. */
export function EvTotal({ total, cap = 510 }: { total: number; cap?: number }) {
  const over = total > cap
  return (
    <p className="ds-ev-total" data-ds="ev-total" data-over={over}>
      {total} / {cap} EV allocated
      {over ? ` — ${total - cap} over the cap` : ''}
    </p>
  )
}

export function MoveSlotTile({ slot, move }: { slot: number; move: string | null }) {
  return (
    <div className="ds-move-tile" data-ds="move-tile">
      <span className="ds-move-tile-label">Move {slot}</span>
      <span className="ds-move-tile-value">{move ?? '—'}</span>
    </div>
  )
}

export function MoveSlotGrid({ moves }: { moves: (string | null)[] }) {
  return (
    <div className="ds-move-grid" data-ds="move-grid">
      {moves.slice(0, 4).map((m, i) => (
        <MoveSlotTile key={i} slot={i + 1} move={m} />
      ))}
    </div>
  )
}
