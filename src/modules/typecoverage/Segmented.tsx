/**
 * A labelled two-or-more-state segmented control.
 *
 * NOT the ds `Toggle`, and that is a spec point rather than a preference: that
 * component's own header says it is a binary state INDICATOR -- the caught dot,
 * the accent's second sanctioned use -- and explicitly not a segmented control.
 * Using it for "Custom / Standard" would spend the alarm colour on a neutral
 * layout choice and would say "on/off" about a pair of equals.
 *
 * TEXT LABELS IN THE TAB STRIP'S STYLE (owner, 2026-10-10), not the pill it
 * was: no track and no fill, the ds Tabs' size and spacing. Selection is weight
 * and tone -- bold `--text-primary` against regular `--text-secondary` -- and
 * NOT the tabs' accent, which this page already spends on the nav and the tab.
 * `data-label` lets CSS reserve each label's bold width, so selecting one does
 * not shift its neighbour.
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
              data-label={option.label}
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
