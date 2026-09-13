import { IconRestore } from '@tabler/icons-react'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { FilterPanel } from '../dex/query/FilterPanel'
import { PanelScroller } from '../dex/query/PanelScroller'
import { SortPanel } from '../dex/query/SortPanel'
import { useDexQueryBundle } from '../dex/query/dexQueryContext'
import { useDisclosureGroup } from '../dex/query/useDisclosureGroup'
import { GlobalSearch } from '../search/GlobalSearch'
import { VersionGroupSelector } from '../version-group/VersionGroupSelector'

/**
 * The app bar's controls: the cross-dex search, the game scope, and -- for
 * whichever Pokepedia page is open -- that page's filters and its sort.
 *
 * ONE SEARCH/FILTER MENU AND ONE SORT MENU FOR THE WHOLE MODULE. Each dex used
 * to carry its own control row above its own list; they are all here now, which
 * is why the trigger reads "Search/Filter" rather than naming one dex's
 * entities. What the menus CONTAIN changes with the page (see
 * DexQueryProvider); where they are does not.
 *
 * TRIGGERS are text-only ghost buttons -- no icon, no border, no fill. The words
 * say exactly what the panel holds, where an icon has to be guessed at (filter
 * or magnifier, each promising something different).
 *
 * ORDER IN THE BAR, left to right: the Pokedex's Grid/List switch, Sort,
 * Search/Filter -- and then the theme switcher, which App.tsx renders after this
 * and which is therefore the rightmost thing in the bar on every screen. That is
 * the point of the order: the theme control does not move as the page-specific
 * triggers come and go beside it.
 *
 * ONE PANEL OPEN AT A TIME, and a press anywhere outside closes it. Both are
 * `useDisclosureGroup`; the outside-click dismissal covers the cross-dex search
 * results too, because they render inside the panel and so count as inside.
 *
 * Panels stay MOUNTED while closed (display: none), so filters keep their values
 * across a close/open and nothing inside is tabbable.
 */
export function ControlsPanel() {
  const bundle = useDexQueryBundle()
  const { openId, toggle, close, ref } = useDisclosureGroup({ dismissOnOutsideClick: true })
  const filtersOpen = openId === 'filters'
  /*
    `&& !sortDisabled` is not belt and braces: the Sort panel can be open when the
    reader flips to the list view, and the trigger that would close it is disabled
    the moment they do -- leaving a panel on screen with no way to dismiss it. The
    switch closes the menus as well (below); this makes the state impossible
    rather than merely unlikely.
  */
  const sortOpen = openId === 'sort' && !bundle.sortDisabled
  const hasFilters = bundle.sections.length > 0
  const hasSort = bundle.sorts.length > 0
  const count = bundle.query.visible.length

  return (
    <div className="app-controls-cluster" ref={ref}>
      {bundle.showViewToggle && (
        <ToggleSwitch
          id="species-view"
          label="View"
          offLabel="Grid"
          onLabel="List"
          checked={bundle.view === 'list'}
          onChange={(next) => {
            bundle.setView(next ? 'list' : 'grid')
            close()
          }}
        />
      )}

      {hasSort && (
        <div className="app-controls" data-testid="dex-sort" data-open={sortOpen}>
          <button
            type="button"
            className="ghost-button app-controls-toggle"
            data-testid="dex-sort-toggle"
            aria-expanded={sortOpen}
            aria-controls="dex-sort-panel"
            /*
              DISABLED, NOT HIDDEN, on a page whose list is a table: the column
              headers are the sort control there, and a trigger that vanished
              when you switched view would read as a bug rather than as "not
              here, and here is where it was".
            */
            disabled={bundle.sortDisabled}
            title={bundle.sortDisabled ? 'Sort the list view from its column headers' : undefined}
            data-filters-active={
              !bundle.sortDisabled && bundle.query.sortKey !== bundle.sorts[0]?.key
            }
            onClick={() => toggle('sort')}
          >
            Sort
          </button>
          <PanelScroller
            className="app-controls-panel dex-menu"
            testId="dex-sort-panel"
            id="dex-sort-panel"
          >
            <div className="app-controls-field">
              <SortPanel dexId="dex" sorts={bundle.sorts} query={bundle.query} />
            </div>
          </PanelScroller>
        </div>
      )}

      <div className="app-controls" data-testid="app-controls" data-open={filtersOpen}>
        <button
          type="button"
          className="ghost-button app-controls-toggle"
          data-testid="controls-toggle"
          aria-expanded={filtersOpen}
          aria-controls="app-controls-panel"
          data-filters-active={bundle.query.activeCount > 0}
          onClick={() => toggle('filters')}
        >
          Search/Filter
        </button>

        <PanelScroller
          className="app-controls-panel dex-menu"
          testId="controls-panel"
          id="app-controls-panel"
        >
          {/* The same action as "Clear all filters" at the foot of the panel, at
              the head of it as well: with "More filters" open the bottom of this
              menu is a long scroll away, and undoing a filter should not be. */}
          {hasFilters && (
            <div className="app-controls-field app-controls-reset">
              <button
                type="button"
                className="ghost-button dex-filter-clear"
                data-testid="controls-reset-top"
                disabled={bundle.query.activeCount === 0}
                onClick={bundle.query.clearAll}
              >
                <IconRestore size={13} stroke={1.5} aria-hidden focusable="false" />
                Reset filters
              </button>
            </div>
          )}

          <div className="app-controls-field">
            <span className="app-controls-label">Search all dexes</span>
            <GlobalSearch />
          </div>

          {/* Directly under the search input, in its own section: the game scope
              governs every list and every era-sensitive field in the app, so it
              belongs at the top of the menu rather than under a long fold. */}
          <div className="app-controls-field">
            <VersionGroupSelector />
          </div>

          {hasFilters && (
            <div className="app-controls-field" data-testid="controls-dex-filters">
              <FilterPanel
                dexId="dex"
                sections={bundle.sections}
                query={bundle.query}
                footer={
                  <p className="dex-filter-count" data-testid="dex-filter-count">
                    {count} {count === 1 ? 'match' : 'matches'}
                  </p>
                }
              />
            </div>
          )}
        </PanelScroller>
      </div>
    </div>
  )
}
