import { useState, type ReactNode } from 'react'

/**
 * A dex's own search and filters, behind one ghost-button toggle.
 *
 * The same disclosure the app bar uses for its cross-dex controls
 * (nav/ControlsPanel.tsx), applied per dex: text-only trigger, no icon, no
 * border, no fill, and a panel that stays open until its own button closes it.
 * Reused rather than reinvented so a dex's search behaves like the one control
 * of this shape the app already had.
 *
 * THE COUNT STAYS VISIBLE. It sits beside the trigger rather than inside the
 * panel: it is a readout, not a control, and hiding it would mean the reader
 * cannot see how many entries the current game has without opening a search box
 * they did not want. What went behind the toggle is the search input and any
 * filter controls -- the things that take an action.
 *
 * MOVEDEX IS THE EXCEPTION, and it is a variant here rather than a second
 * component: `variant="inline"` drops the toggle and lays the search, the filters
 * and the count out in one always-visible row. Its table is dense enough that
 * filtering is the primary way through it, so hiding the filter behind a click
 * would be hiding the main control. Same inputs, same test ids, one layout
 * decision -- which is why it is a prop and not a fork.
 */
export function DexControls({
  dexId,
  count,
  search,
  onSearch,
  label,
  variant = 'disclosure',
  children,
}: {
  dexId: string
  /** Entries currently listed, after search. */
  count: number
  search: string
  onSearch: (value: string) => void
  /** Trigger text, e.g. "Search/filter items". */
  label: string
  /** "inline" is the Movedex exception -- see the note above. */
  variant?: 'disclosure' | 'inline'
  /** Extra controls inside the panel, e.g. a type filter. */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const filtering = search.trim().length > 0

  const searchInput = (
    <input
      type="search"
      data-testid={`${dexId}-search`}
      placeholder="Search by name…"
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      aria-label={`Search ${dexId} by name`}
    />
  )

  const countReadout = (
    <p className="subtitle dex-controls-count" data-testid={`${dexId}-count`}>
      {count} {count === 1 ? 'entry' : 'entries'}
    </p>
  )

  if (variant === 'inline') {
    return (
      <div
        className="dex-controls dex-controls-inline"
        data-testid={`${dexId}-controls`}
        data-open="true"
      >
        {searchInput}
        {children}
        {countReadout}
      </div>
    )
  }

  return (
    <div className="dex-controls" data-testid={`${dexId}-controls`} data-open={open}>
      <button
        type="button"
        className="ghost-button dex-controls-toggle"
        data-testid={`${dexId}-controls-toggle`}
        aria-expanded={open}
        aria-controls={`${dexId}-controls-panel`}
        // Narrowing the list is a binary state, which is one of --accent's three
        // sanctioned uses -- same rule the app bar's toggle follows.
        data-filters-active={filtering}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>

      {countReadout}

      {/* Kept mounted, hidden with display:none: the search keeps its text across
          a close/open, and nothing inside is tabbable while closed. */}
      <div
        className="dex-controls-panel"
        id={`${dexId}-controls-panel`}
        data-testid={`${dexId}-controls-panel`}
      >
        {searchInput}
        {children}
      </div>
    </div>
  )
}
