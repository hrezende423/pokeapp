interface Props {
  /** Stable slug: drives the test id (`toggle-<id>`) and the label association. */
  id: string
  /** What the toggle controls, e.g. "Source". */
  label: string
  /** Caption for the off position, shown left of the track. */
  offLabel: string
  /** Caption for the on position, shown right of the track. */
  onLabel: string
  /** true = the `onLabel` side is selected. */
  checked: boolean
  disabled?: boolean
  /** Why it is disabled. Surfaced as the title/aria-description, not swallowed. */
  disabledReason?: string
  onChange: (next: boolean) => void
}

/**
 * A two-position switch with a caption on each side.
 *
 * `role="switch"` rather than a checkbox because both positions are meaningful
 * values (In-game / Artwork), not present-or-absent. The disabled state keeps
 * rendering: a control that vanishes when unavailable tells the user nothing,
 * while a greyed-out one with a reason explains why the option is missing.
 */
export function ToggleSwitch({
  id,
  label,
  offLabel,
  onLabel,
  checked,
  disabled = false,
  disabledReason,
  onChange,
}: Props) {
  const labelId = `toggle-${id}-label`
  return (
    <div className={disabled ? 'toggle toggle-disabled' : 'toggle'} data-toggle={id}>
      <span className="toggle-label" id={labelId}>
        {label}
      </span>
      <span className="toggle-row">
        <span className={checked ? 'toggle-side' : 'toggle-side toggle-side-on'}>{offLabel}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-disabled={disabled || undefined}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          data-testid={`toggle-${id}`}
          data-state={checked ? 'on' : 'off'}
          data-value={checked ? onLabel : offLabel}
          data-disabled={disabled}
          className="toggle-track"
          onClick={() => onChange(!checked)}
        >
          <span className="toggle-knob" />
        </button>
        <span className={checked ? 'toggle-side toggle-side-on' : 'toggle-side'}>{onLabel}</span>
      </span>
      {disabled && disabledReason && (
        <span className="toggle-reason" data-testid={`toggle-${id}-reason`}>
          {disabledReason}
        </span>
      )}
    </div>
  )
}
