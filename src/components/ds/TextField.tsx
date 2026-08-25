import { IconCheck } from '@tabler/icons-react'
import type { InputHTMLAttributes } from 'react'

export type FieldState = 'default' | 'focus' | 'disabled' | 'error' | 'success'

/**
 * Hairline-underline text field: label above, bottom border only, no box, no fill
 * (DESIGN-SYSTEM.md §5), with the four states built in ds-form-field-states.html
 * plus the success treatment specified in design-tokens.json.
 *
 *   focus     2px --accent underline, reusing the active-tab language exactly
 *             rather than inventing a focus treatment. The padding drops by the
 *             1px the border gained, so the field does not shift.
 *   disabled  label, value and border all at 40% opacity, no pointer cursor.
 *   error     underline becomes --accent (staying 1px) and the helper slot
 *             becomes an error message in --accent. This is the accent's third
 *             sanctioned use, confirmed in §8.
 *   success   a checkmark in --text-primary. Deliberately NOT a status-green:
 *             introducing a semantic colour for this one case was judged not
 *             worth breaking monochrome+one-accent.
 *
 * `state` is how the reference page shows all states at once, the way the HTML
 * does with its .focus class; real keyboard focus is styled by :focus as well, so
 * the component behaves correctly without the prop being set.
 */
export function TextField({
  label,
  helper,
  error,
  state = 'default',
  ...rest
}: {
  label: string
  /** Secondary line under the field. Replaced by `error` when state is error. */
  helper?: string
  error?: string
  state?: FieldState
} & InputHTMLAttributes<HTMLInputElement>) {
  const isError = state === 'error'
  return (
    <label className="ds-field" data-ds="text-field" data-state={state}>
      <span className="ds-field-label">{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-gap-sm)' }}>
        <input className="ds-field-control" disabled={state === 'disabled'} {...rest} />
        {state === 'success' && (
          <IconCheck
            size={16}
            stroke={1.5}
            color="var(--text-primary)"
            data-ds="field-success-icon"
            aria-label="Valid"
          />
        )}
      </span>
      {isError && error ? (
        <span className="ds-field-error" role="alert">
          {error}
        </span>
      ) : (
        helper && <span className="ds-field-helper">{helper}</span>
      )}
    </label>
  )
}
