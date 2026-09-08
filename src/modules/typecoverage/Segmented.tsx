/**
 * A labelled two-or-more-state segmented control.
 *
 * NOT the ds `Toggle`, and that is a spec point rather than a preference: that
 * component's own header says it is a binary state INDICATOR -- the caught dot,
 * the accent's second sanctioned use -- and explicitly not a segmented control.
 * Using it for "Custom / Standard" would spend the alarm colour on a neutral
 * layout choice and would say "on/off" about a pair of equals.
 *
 * The visual language is the one already shipped twice: the theme switcher's
 * pill (`.ds-theme-switcher`) and the species page's scope segments. A track in
 * `--hairline` with the selected segment lifted to `--surface-raised` -- a tone
 * step, never a shadow, and never an accent fill.
 *
 * SELECTION IS CARRIED BY WEIGHT AS WELL AS FILL. In dark mode the tone
 * relationship inverts (`--surface-raised` #1c1c1e is darker than `--hairline`
 * #2c2c2e), so the selected segment reads slightly recessed rather than raised.
 * That is left alone rather than papered over with a new token, for the reason
 * ThemeSwitcher records: the bold `--text-primary` label against a regular
 * `--text-secondary` one is what actually communicates the state, and relying on
 * the fill alone would have been the accessibility bug.
 *
 * `aria-pressed` on real buttons rather than radio semantics, matching the two
 * controls above: every segment stays individually tabbable and no arrow-key
 * handling is needed.
 */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  /** Visible name of the choice, beside the track. */
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  testId: string
}) {
  return (
    <div className="tc-segmented" data-testid={testId}>
      <span className="tc-control-label" id={`${testId}-label`}>
        {label}
      </span>
      <div className="tc-segments" role="group" aria-labelledby={`${testId}-label`}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              className="tc-segment"
              data-testid={`${testId}-${option.value}`}
              data-active={active}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
