import type { ButtonHTMLAttributes } from 'react'

/**
 * Primary and secondary only (DESIGN-SYSTEM.md §5): no tertiary, ghost or danger
 * variant is specified, so none is invented here.
 *
 * Primary stays monochrome -- it uses --button-primary-fill, which inverts
 * between modes, rather than the accent. The accent has four sanctioned uses
 * (active tab/nav, binary indicators, error/validation) and a primary button is
 * none of them.
 *
 * No shadow, no border on primary.
 */
export function Button({
  variant = 'primary',
  children,
  ...rest
}: { variant?: 'primary' | 'secondary' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`ds-btn ds-btn-${variant}`}
      data-ds={`button-${variant}`}
      {...rest}
    >
      {children}
    </button>
  )
}
