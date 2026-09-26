import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface SearchOption {
  value: string
  label: string
  /** Secondary text on the right of the row (a dex number, a type). */
  hint?: string
}

/**
 * A select you can type into: the hairline-underline field of TextField, with a
 * filtered list under it. For choices too long to scroll -- 493 species -- where a
 * native <select> is a chore.
 *
 * SAME SHELL AS TextField/SelectField (label above, underline, 2px accent focus
 * rule, unicode chevron), so a strip that mixes the three reads as one form. The
 * list is `--surface-raised` plus a hairline, the design system's whole recipe for
 * something floating -- no shadow.
 *
 * It holds no index of its own: the options are whatever the caller scoped them
 * to (entrySources.ts, for a dex list), and matching is a plain case-insensitive
 * substring over the label, the same as GlobalSearch.
 *
 * Typing never commits. The field shows the query while it is focused and the
 * selected option's label otherwise, so leaving it half-typed changes nothing.
 */
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  fieldSize,
  maxResults = 60,
  testId,
}: {
  label: string
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  fieldSize?: 'narrow' | 'wide'
  maxResults?: number
  testId?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLLabelElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    return hits.slice(0, maxResults)
  }, [options, query, maxResults])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const commit = (option: SearchOption | undefined) => {
    if (option) onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <label
      ref={wrapRef}
      className="ds-field ds-select-wrap ds-search-select"
      data-ds="search-select"
      data-size={fieldSize}
      data-testid={testId}
    >
      <span className="ds-field-label">{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          className="ds-field-control"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? '')}
          data-testid={testId ? `${testId}-input` : undefined}
          onFocus={(e) => {
            setOpen(true)
            setQuery('')
            setActive(0)
            e.currentTarget.select()
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((i) => Math.min(matches.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              if (open) {
                e.preventDefault()
                commit(matches[active])
                e.currentTarget.blur()
              }
            } else if (e.key === 'Escape') {
              setOpen(false)
              setQuery('')
              e.currentTarget.blur()
            }
          }}
        />
        <span className="ds-select-chevron" aria-hidden>
          ▾
        </span>
        {open && (
          <ul
            className="ds-search-list"
            id={listId}
            role="listbox"
            data-testid={testId ? `${testId}-list` : undefined}
          >
            {matches.length === 0 && <li className="ds-search-empty">No match</li>}
            {matches.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active ? 'true' : undefined}
                className="ds-search-option"
                // pointerdown, not click: the input's blur would close the list first.
                onPointerDown={(e) => {
                  e.preventDefault()
                  commit(o)
                }}
                onPointerEnter={() => setActive(i)}
              >
                <span>{o.label}</span>
                {o.hint && <span className="ds-search-hint">{o.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </span>
    </label>
  )
}
