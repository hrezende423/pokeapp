/**
 * Binary state indicator -- specifically the "caught" toggle and future toggles
 * genuinely like it. This is the accent's second sanctioned use.
 *
 * NOT a segmented control and not a toggle-button-group: those are separate
 * patterns the design system lists as undesigned (§7), so this component does not
 * try to cover them.
 *
 * Off state is --hairline, which is what the reference panels' #e5e5e5 / #2c2c2e
 * resolve to in the two modes. On state is --accent.
 *
 * A real <button aria-pressed>, so the state is announced rather than conveyed by
 * colour alone. No Poke Ball glyph: that icon is on the custom-icons-needed list
 * and has not been drawn, and inventing one here would pre-empt it.
 */
export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean
  /** Visible text beside the track. */
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className="ds-toggle"
      data-ds="toggle"
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      <span>{label}</span>
      <span className="ds-toggle-track">
        <span className="ds-toggle-thumb" />
      </span>
    </button>
  )
}
