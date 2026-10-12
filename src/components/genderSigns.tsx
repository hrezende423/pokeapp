import { Fragment, type ReactNode } from 'react'
import { GenderSign } from './GenderSign'

/** A label with its ♂ / ♀ characters drawn as GenderSign; other text as is. */
export function withGenderSigns(text: string): ReactNode {
  if (!/[♂♀]/.test(text)) return text
  return text
    .split(/([♂♀])/)
    .map((part, i) =>
      part === '♂' || part === '♀' ? (
        <GenderSign key={i} sign={part} />
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    )
}
