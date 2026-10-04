/**
 * The design system's dropdown (design-system/components/select.md), for the
 * Build Form.
 *
 * WHY NOT A STYLED <select>. The open menu of a native select is painted by the
 * browser, so none of the spec's menu can be had from CSS: the hairline frame,
 * hover = semibold with no background, selected = semibold + ✓. So the menu is
 * drawn here, as a listbox.
 *
 * THE NATIVE SELECT STAYS, and does two jobs:
 *   - ON TOUCH it is the control. The spec says "on touch use the native
 *     <select> picker", so under `pointer: coarse` it is stretched invisibly over
 *     the trigger and a tap opens the platform picker (see `.tb-dselect-native`).
 *   - EVERYWHERE it carries the `data-testid`, value and disabled state, so the
 *     verify suites' `selectOption` calls drive the same commit path as a click.
 *     With a fine pointer it is 1px, transparent, out of the tab order and
 *     hidden from assistive tech -- the trigger and the listbox are the control.
 *
 * MORE THAN 15 OPTIONS GETS A FILTER FIELD at the top of the menu (select.md:
 * ">15: searchable combobox, same menu plus a filter field at top"). 493 species
 * cannot be scrolled; under the limit, type-ahead jumps instead.
 *
 * KEYS: Up/Down move, Enter/Space select, Escape closes and returns focus, Tab
 * closes, Home/End jump, type-ahead jumps. The moving row gets the 2px inset ring
 * (`data-active`), mouse hover only the weight.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface DsOption {
  value: string
  label: string
  disabled?: boolean
}

const FILTER_FROM = 15

export function DsSelect({
  value,
  options,
  onChange,
  disabled = false,
  testId,
  title,
}: {
  value: string
  options: DsOption[]
  onChange: (value: string) => void
  disabled?: boolean
  testId?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const filterable = options.length > FILTER_FROM
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const close = (refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }
  const openMenu = () => {
    if (disabled) return
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const choose = (option: DsOption | undefined) => {
    if (!option || option.disabled) return
    if (option.value !== value) onChange(option.value)
    close(true)
  }

  /* Focus moves into the menu once it exists; the filter field when there is one. */
  useEffect(() => {
    if (!open) return
    if (filterable) filterRef.current?.focus()
    else listRef.current?.focus()
  }, [open, filterable])

  /* The moving row stays in view. */
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  /* An outside press closes without stealing focus back. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const move = (from: number, dir: 1 | -1): number => {
    for (let i = from + dir; i >= 0 && i < shown.length; i += dir) {
      if (!shown[i].disabled) return i
    }
    return from
  }

  const onMenuKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => move(i, 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => move(i, -1))
        return
      case 'Home':
        if (filterable) return
        e.preventDefault()
        setActive(move(-1, 1))
        return
      case 'End':
        if (filterable) return
        e.preventDefault()
        setActive(move(shown.length, -1))
        return
      case 'Enter':
        e.preventDefault()
        choose(shown[active])
        return
      case ' ':
        if (filterable) return
        e.preventDefault()
        choose(shown[active])
        return
      case 'Escape':
        e.preventDefault()
        close(true)
        return
      case 'Tab':
        close(false)
        return
    }
    /* Type-ahead, for the short lists that have no filter field. */
    if (!filterable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const text = (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase()
      typed.current = { text, at: now }
      const hit = shown.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(text))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <span
      ref={wrapRef}
      className="tb-dselect"
      data-open={open ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className="tb-dselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        title={title}
        data-testid={testId ? `trigger-${testId}` : undefined}
        onClick={() => (open ? close(true) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openMenu()
          }
        }}
      >
        <span className="tb-dselect-value">{selected?.label ?? '—'}</span>
        <span className="tb-dselect-chevron" aria-hidden>
          {open ? '↑' : '↓'}
        </span>
      </button>
      <select
        className="tb-dselect-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {open && (
        <div
          className="tb-dselect-menu"
          data-testid={testId ? `menu-${testId}` : undefined}
          /* The menu sits inside the field's <label>. A click on an option is
             not on interactive content, so the label would forward it to the
             trigger and re-open the menu just closed; cancelling the default
             cancels that activation. */
          onClick={(e) => e.preventDefault()}
        >
          {filterable && (
            <input
              ref={filterRef}
              className="tb-dselect-filter"
              value={query}
              placeholder="Filter"
              aria-label="Filter options"
              aria-controls={listId}
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onMenuKey}
            />
          )}
          <div
            ref={listRef}
            id={listId}
            className="tb-dselect-list"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            onKeyDown={onMenuKey}
          >
            {shown.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                className="tb-dselect-option"
                data-index={i}
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-active={i === active ? 'true' : undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span className="tb-dselect-option-label">{o.label}</span>
                {o.value === value && (
                  <span className="tb-dselect-check" aria-hidden>
                    ✓
                  </span>
                )}
              </div>
            ))}
            {shown.length === 0 && <div className="tb-dselect-empty">No match</div>}
          </div>
        </div>
      )}
    </span>
  )
}
