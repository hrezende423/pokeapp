import type { ReactNode } from 'react'
import { useDisclosureGroup } from './query/useDisclosureGroup'

/**
 * A dex's own search, filters and sort, behind two ghost-button toggles.
 *
 * The same disclosure the app bar uses for its cross-dex controls
 * (nav/ControlsPanel.tsx), applied per dex: text-only triggers, no icon, no
 * border, no fill, and a panel anchored under the trigger that opened it.
 *
 * TWO TRIGGERS, ONE OPEN AT A TIME. Search/filter and Sort are independent
 * questions and get independent panels, but both float over the same list, so
 * opening one closes the other -- `useDisclosureGroup` makes that structural
 * rather than a pair of handlers that have to remember each other. A press
 * anywhere outside the row closes whichever is open; that is this pattern's
 * behaviour and NOT the app bar's, which holds the cross-dex search and must not
 * vanish under a click aimed at its own results. The trigger still closes its own
 * panel, so nothing depends on knowing the outside-click rule exists.
 *
 * THE COUNT STAYS VISIBLE. It sits beside the triggers rather than inside a
 * panel: it is a readout, not a control, and hiding it would mean the reader
 * cannot see how many entries the current game has without opening a search box
 * they did not want.
 *
 * MOVEDEX IS THE EXCEPTION, and it is a variant here rather than a second
 * component: `variant="inline"` drops the toggles and lays the search, the
 * filters and the count out in one always-visible row. Its table is dense enough
 * that filtering is the primary way through it, and its sorting is its column
 * headers, so it has nothing to put behind a click. Same inputs, same test ids,
 * one layout decision -- which is why it is a prop and not a fork.
 */
export function DexControls({
  dexId,
  count,
  searchValue,
  onSearchChange,
  label,
  variant = 'disclosure',
  filterPanel,
  sortPanel,
  filtersActive = false,
  sortActive = false,
  children,
}: {
  dexId: string
  /** Entries currently listed, after every filter. */
  count: number
  /** The name filter's text. Rendered inline here only in the Movedex variant. */
  searchValue: string
  onSearchChange: (value: string) => void
  /** Trigger text, e.g. "Search/filter items". */
  label: string
  /** "inline" is the Movedex exception -- see the note above. */
  variant?: 'disclosure' | 'inline'
  /** Contents of the filter disclosure. Omitted for the inline variant. */
  filterPanel?: ReactNode
  /** Contents of the sort disclosure. Omit entirely for a dex with no sorting. */
  sortPanel?: ReactNode
  /** Any filter is narrowing the list. Drives the trigger's accent. */
  filtersActive?: boolean
  /** A sort other than the default is applied. */
  sortActive?: boolean
  /** Extra controls, appended inside the filter panel (or the inline row). */
  children?: ReactNode
}) {
  const { openId, toggle, ref } = useDisclosureGroup({ dismissOnOutsideClick: true })
  const filterOpen = openId === 'filter'
  const sortOpen = openId === 'sort'

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
        <input
          type="search"
          data-testid={`${dexId}-search`}
          placeholder="Search by name…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={`Search ${dexId} by name`}
        />
        {children}
        {countReadout}
      </div>
    )
  }

  return (
    <div
      className="dex-controls"
      data-testid={`${dexId}-controls`}
      // Still named `data-open`, and still meaning "the filter panel is open":
      // the verification helpers read it, and the sort panel got its own
      // attribute rather than overloading this one.
      data-open={filterOpen}
      data-sort-open={sortOpen}
      ref={ref}
    >
      <div className="dex-control-group" data-open={filterOpen}>
        <button
          type="button"
          className="ghost-button dex-controls-toggle"
          data-testid={`${dexId}-controls-toggle`}
          aria-expanded={filterOpen}
          aria-controls={`${dexId}-controls-panel`}
          // Narrowing the list is a binary state, which is one of --accent's
          // sanctioned uses -- same rule the app bar's toggle follows.
          data-filters-active={filtersActive}
          onClick={() => toggle('filter')}
        >
          {label}
        </button>

        {/* Kept mounted, hidden with display:none: the filters keep their values
            across a close/open, and nothing inside is tabbable while closed. */}
        <div
          className="dex-controls-panel"
          id={`${dexId}-controls-panel`}
          data-testid={`${dexId}-controls-panel`}
        >
          {filterPanel}
          {children}
        </div>
      </div>

      {sortPanel && (
        <div className="dex-control-group dex-control-group-sort" data-open={sortOpen}>
          <button
            type="button"
            className="ghost-button dex-sort-toggle"
            data-testid={`${dexId}-sort-toggle`}
            aria-expanded={sortOpen}
            aria-controls={`${dexId}-sort-panel`}
            data-filters-active={sortActive}
            onClick={() => toggle('sort')}
          >
            Sort
          </button>
          <div
            className="dex-sort-panel"
            id={`${dexId}-sort-panel`}
            data-testid={`${dexId}-sort-panel`}
          >
            {sortPanel}
          </div>
        </div>
      )}

      {countReadout}
    </div>
  )
}
