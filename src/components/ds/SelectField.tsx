import type { SelectHTMLAttributes } from 'react'
import type { FieldState } from './TextField'

/**
 * A styled native <select>, not a custom dropdown-menu overlay -- §7 clarifies
 * that distinction explicitly, and the overlay menu is a separate undesigned
 * component.
 *
 * Same hairline-underline shell as the text field. The chevron is the unicode
 * character the spec asks for ("a small unicode chevron rather than a styled
 * native arrow"), which is why it is not a Tabler icon: the spec names the glyph.
 */
export function SelectField({
  label,
  hideLabel = false,
  helper,
  options,
  state = 'default',
  ...rest
}: {
  label: string
  /** Visually suppressed, still in the DOM -- see TextField's note. */
  hideLabel?: boolean
  helper?: string
  /**
   * Either plain strings (value === label) or explicit pairs. The pairs form is
   * what the dex filter panels need: "Any" has to submit an empty value, and a
   * growth rate's value is `medium-slow` where its label is "Medium Slow".
   */
  options: (string | { value: string; label: string })[]
  state?: FieldState
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="ds-field ds-select-wrap" data-ds="select-field" data-state={state}>
      <span className={hideLabel ? 'ds-field-label visually-hidden' : 'ds-field-label'}>
        {label}
      </span>
      <span style={{ position: 'relative', display: 'block' }}>
        <select className="ds-field-control" disabled={state === 'disabled'} {...rest}>
          {options.map((o) => {
            const option = typeof o === 'string' ? { value: o, label: o } : o
            return (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            )
          })}
        </select>
        <span className="ds-select-chevron" aria-hidden>
          ▾
        </span>
      </span>
      {helper && <span className="ds-field-helper">{helper}</span>}
    </label>
  )
}
