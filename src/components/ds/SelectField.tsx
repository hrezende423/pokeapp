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
  helper,
  options,
  state = 'default',
  ...rest
}: {
  label: string
  helper?: string
  options: string[]
  state?: FieldState
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="ds-field ds-select-wrap" data-ds="select-field" data-state={state}>
      <span className="ds-field-label">{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <select className="ds-field-control" disabled={state === 'disabled'} {...rest}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="ds-select-chevron" aria-hidden>
          ▾
        </span>
      </span>
      {helper && <span className="ds-field-helper">{helper}</span>}
    </label>
  )
}
